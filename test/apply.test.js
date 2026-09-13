"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { discover, readTarget, transform, apply } = require("../setup/apply-config");
const { initialState } = require("../setup/generator");
const state = { ...initialState("UTC"), calendarUrl: "https://www.arbiterlive.com/calendar/example.ics" };
const source = 'var config = { port: 8080, modules: [{ module: "compliments", config: { text: "keep" } }] }; if (typeof module !== "undefined") { module.exports = config; }';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "athletics-apply-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, "config.js"); fs.writeFileSync(target, source);
  return target;
}
const evaluate = text => { const context = { module: {} }; vm.runInNewContext(text, context); return context.module.exports; };
test("apply discovers installation root and only permits explicit fallback paths", () => {
  assert.equal(discover('/example/MagicMirror/modules/MMM-SchoolAthletics', '/ignored'), '/example/MagicMirror/config/config.js');
  assert.equal(discover('/example/project', '/example/config.js'), '/example/config.js');
  assert.throws(() => discover('/example/project'), /Cannot detect/);
  assert.throws(() => discover('/example/project', 'relative.js'), /absolute/);
});
test("apply backs up exact original and preserves unrelated modules and settings", t => {
  const target = fixture(t);
  const result = apply(target, state, readTarget(target).version);
  assert.equal(fs.readFileSync(result.backup, 'utf8'), source);
  assert.match(result.backup, /config.js.backup-\d{4}-/);
  let config = evaluate(fs.readFileSync(target, 'utf8'));
  assert.equal(config.port, 8080);
  assert.equal(config.modules[1].config.text, 'keep');
  apply(target, { ...state, schoolName: 'Example Academy' }, result.version);
  config = evaluate(fs.readFileSync(target, 'utf8'));
  assert.equal(config.modules.length, 2);
  assert.equal(config.modules[0].config.schoolName, 'Example Academy');
});
test("clean apply replaces entire modules array with optional clock", () => {
  for (const showDateTime of [true, false]) {
    const config = evaluate(transform(source, { ...state, outputMode: 'clean', showDateTime }));
    assert.deepEqual(Array.from(config.modules, m => m.module), ['clock', 'MMM-SchoolAthletics']);
    assert.equal(config.port, 8080);
  }
});
test("invalid generated config, missing targets and stale revisions never write", t => {
  const target = fixture(t);
  assert.throws(() => apply(target, { ...state, calendarUrl: '' }, readTarget(target).version), /Invalid/);
  assert.throws(() => apply(target, state, 'stale'), /changed/);
  assert.throws(() => apply(target + '.missing', state, ''), /ENOENT/);
  assert.equal(fs.readFileSync(target, 'utf8'), source);
  assert.equal(fs.readdirSync(path.dirname(target)).length, 1);
});
test("failed backup, temporary write or rename leaves original intact", t => {
  const target = fixture(t);
  for (const stage of ['backup', 'temporary', 'rename']) {
    const io = { ...fs, writeFileSync(file, ...args) {
      if (stage === 'backup' && file.includes('.backup-') || stage === 'temporary' && file.includes('.tmp-')) throw new Error('write failure');
      return fs.writeFileSync(file, ...args);
    }, renameSync(...args) { if (stage === 'rename') throw new Error('rename failure'); return fs.renameSync(...args); } };
    assert.throws(() => apply(target, state, readTarget(target).version, io), /failure/);
    assert.equal(fs.readFileSync(target, 'utf8'), source);
    assert.ok(!fs.readdirSync(path.dirname(target)).some(file => file.includes('.tmp-')));
  }
});
test("dynamic configs and duplicate athletics instances fail safely without execution", () => {
  for (const text of ['var config = makeConfig();', source + ' config.modules.push({});', 'var config = { modules: [...entries] };', 'var config = { modules: [{module:"MMM-SchoolAthletics"},{module:"MMM-SchoolAthletics"}] };']) assert.throws(() => transform(text, state));
});

test("local helper rejects cross-origin writes and config downloads", async t => {
  const { Readable } = require('node:stream');
  const { createServer } = require('../setup/server');
  const target = fixture(t);
  const server = createServer(path.resolve('.'), target);
  async function request(url, method = 'GET', headers = {}, body = '') {
    const req = Readable.from([body]);
    Object.assign(req, { url, method, headers: { host: '127.0.0.1:8081', ...headers }, socket: { localPort: 8081 } });
    return new Promise(resolve => {
      let status;
      server.emit('request', req, { writeHead(code) { status = code; }, end(data) { resolve({ status, data: String(data) }); } });
    });
  }
  assert.equal((await request('/api/target', 'GET', {host:'attacker.example:8081'})).status, 403);
  assert.equal((await request('/api/apply', 'POST', {origin:'https://attacker.example'})).status, 403);
  assert.equal((await request('/api/apply', 'POST')).status, 403);
  assert.equal((await request('/package.json')).status, 400);
  const info = JSON.parse((await request('/api/target')).data);
  assert.equal(info.target, target);
  const applied = await request('/api/apply', 'POST', {origin:'http://127.0.0.1:8081', 'content-type':'application/json', 'x-setup-apply':'1'}, JSON.stringify({state, version:info.version}));
  assert.equal(applied.status, 200);
  assert.ok(fs.existsSync(JSON.parse(applied.data).backup));
});

test("apply UI waits for valid state and explicit click before writing", async () => {
  const setup = require('../setup/generator');
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, {value:'', checked:false, type:'text', disabled:true, textContent:'', handlers:{}, addEventListener(event, fn) { this.handlers[event] = fn; }}); return nodes.get(id); };
  for (const [key, value] of Object.entries({...state, calendarUrl:''})) Object.assign(node(key), typeof value === 'boolean' ? {type:'checkbox', checked:value} : {value});
  const requests = [];
  const context = { SchoolAthleticsSetup:setup, location:{hostname:'127.0.0.1',port:'8081'}, document:{getElementById:node}, fetch:async (url, options) => {
    requests.push({url, options});
    return {ok:true,json:async () => url === '/api/target' ? {target:'/example/config.js',version:'one'} : {backup:'/example/config.js.backup',version:'two'}};
  }};
  vm.runInNewContext(fs.readFileSync('setup/apply-ui.js','utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('apply-config').disabled, true);
  assert.match(node('apply-target').textContent, /\/example\/config.js/);
  node('calendarUrl').value = state.calendarUrl;
  node('setup-form').handlers.input();
  assert.equal(node('apply-config').disabled, false);
  assert.equal(requests.length, 1);
  await node('apply-config').handlers.click();
  assert.equal(requests[1].url, '/api/apply');
  assert.match(node('apply-status').textContent, /Configuration applied successfully/);
});

test("clean apply preserves current weather config exactly and removes unrelated widgets", t => {
  const target = fixture(t);
  const weatherConfig = `{ type: "current", weatherProvider: "example-provider", location: "Example Town", apiKey: "fixture-key", units: "metric", /* retain comment */ extra: [1, 2] }`;
  const widget = `{ module: "weather", position: "top_right", header: "Conditions", config: ${weatherConfig} }`;
  const original = `var config = { modules: [{module:"calendar"}, {module:"compliments"}, {module:"newsfeed"}, {module:"updatenotification"}, {module:"weather",config:{type:"forecast"}}, ${widget}] }; module.exports = config;`;
  fs.writeFileSync(target, original);
  const result = apply(target, {...state, outputMode:'clean', showDateTime:false, showWeather:false}, readTarget(target).version);
  const updated = fs.readFileSync(target,'utf8');
  const config = evaluate(updated);
  assert.deepEqual(Array.from(config.modules, m => m.module), ['clock','weather','MMM-SchoolAthletics']);
  assert.equal(config.modules[0].position, 'top_left');
  assert.equal(config.modules[2].position, 'middle_center');
  assert.ok(updated.includes(widget));
  assert.ok(updated.includes(weatherConfig));
  assert.equal(fs.readFileSync(result.backup,'utf8'), original);
  assert.match(result.weather, /preserved/);
  const moduleOnly = evaluate(transform(original, state));
  assert.equal(moduleOnly.modules.length, 7);
  assert.ok(transform(original,state).includes(widget));
});

test("clean mode omits unidentifiable weather and reports absence", () => {
  for (const widget of ['', '{module:"weather",config:{type:"forecast",weatherProvider:"example",location:"Example"}},', '{module:"weather",disabled:true,config:{type:"current",weatherProvider:"example",location:"Example"}},', '{module:"weather",config:{type:"current"}},']) {
    const report = {};
    const output = transform(`var config={modules:[${widget}]}; module.exports=config;`, {...state,outputMode:'clean'}, report);
    assert.deepEqual(Array.from(evaluate(output).modules, m=>m.module), ['clock','MMM-SchoolAthletics']);
    assert.match(report.weather, /weather omitted/);
  }
});

test("clean weather selection prefers top-right and relocates without reconstructing config", () => {
  const first = '{module:"weather",position:"bottom_left",config:{type:"current",weatherProvider:"example",location:"First"}}';
  const second = '{module:"weather",position:"top_right",config:{type:"current",weatherProvider:"example",location:"Second"}}';
  const source = widgets => `var config={modules:[${widgets}]};module.exports=config;`;
  assert.equal(evaluate(transform(source(first+','+second), {...state,outputMode:'clean'})).modules[1].config.location,'Second');
  const moved = transform(source(first), {...state,outputMode:'clean'});
  assert.ok(moved.includes('config:{type:"current",weatherProvider:"example",location:"First"}'));
  assert.equal(evaluate(moved).modules[1].position,'top_right');
});
