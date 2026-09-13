"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const path = require("node:path");
const config = { calendarUrl: "https://www.arbiterlive.com/calendar", timeZone: "UTC" };
function schedule() { return { date: "2026-09-12", home: { today: [{ id: "a", team: "Soccer", opponent: "East HS", start: "2026-09-12T18:00:00Z", date: "2026-09-12", kind: "home", cancelled: true }], upcoming: [] }, away: { today: [], upcoming: [] }, unknown: { today: [{ id: "b", team: "Meet", start: "2026-09-12T20:00:00Z", date: "2026-09-12", kind: "unknown" }], upcoming: [] } }; }
function element(tag) {
  return { tag, children: [], style: { setProperty() {} }, _text: "", className: "", appendChild(child) { this.children.push(child); }, addEventListener() {}, remove() {},
    set textContent(value) { this._text = value; }, get textContent() { return this._text + this.children.map(c => c.textContent).join(" "); }
  };
}
function frontend(extra = {}) {
  let definition;
  const timers = new Map();
  let id = 0;
  const context = vm.createContext({ URL, Intl, Date, console, document: { createElement: element }, Module: { register(name, value) { assert.equal(name, "MMM-SchoolAthletics"); definition = value; } }, setInterval: fn => { timers.set(++id, fn); return id; }, clearInterval: id => timers.delete(id), setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  vm.runInContext(fs.readFileSync("shared/config.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("MMM-SchoolAthletics.js", "utf8"), context);
  const sent = [];
  const instance = Object.assign({}, definition, { config: { ...config, ...extra }, identifier: "one", updateDom() {}, sendSocketNotification(type, payload) { sent.push({ type, payload }); } });
  instance.start();
  return { instance, timers, sent };
}
test("frontend keeps useful data on error and ignores older responses", () => {
  const { instance: front, sent } = frontend();
  front.socketNotificationReceived("SCHOOL_ATHLETICS_EVENTS", { instanceId: "one", requestId: 1, data: schedule(), lastUpdated: "2026-09-12T18:00:00Z" });
  assert.match(front.getDom().textContent, /Soccer/);
  assert.doesNotMatch(front.getDom().textContent, /UNCLASSIFIED GAMES/);
  assert.equal(front.getDom().children.filter(child => child.tag === "section").length, 2);
  assert.match(front.getDom().textContent, /CANCELLED/);
  front.fetchEvents();
  assert.equal(sent.length, 2);
  front.socketNotificationReceived("SCHOOL_ATHLETICS_EVENTS_ERROR", { instanceId: "one", requestId: 1, message: "old" });
  assert.equal(front.error, null);
  front.socketNotificationReceived("SCHOOL_ATHLETICS_EVENTS_ERROR", { instanceId: "one", requestId: 2, message: "offline" });
  assert.match(front.getDom().textContent, /Showing saved schedule/);
  assert.match(front.getDom().textContent, /Soccer/);
  front.socketNotificationReceived("SCHOOL_ATHLETICS_LOGOS", { instanceId: "one", requestId: 1, logos: { a: "old.png" } });
  assert.equal(front.schedule.home.today[0].logoUrl, undefined);
});
test("frontend validates before timers and prevents overlap; suspend invalidates replies", () => {
  const invalid = frontend({ refreshInterval: "fast" });
  assert.equal(invalid.timers.size, 0);
  assert.match(invalid.instance.getDom().textContent, /refreshInterval/);
  const { instance, sent, timers } = frontend();
  instance.fetchEvents();
  assert.equal(sent.length, 1);
  instance.suspend();
  assert.equal(timers.size, 0);
  instance.socketNotificationReceived("SCHOOL_ATHLETICS_EVENTS", { instanceId: "one", requestId: 1, data: schedule() });
  assert.equal(instance.schedule, undefined);
  instance.resume();
  assert.equal(sent.length, 2);
  assert.ok(sent[1].payload.requestId > 1);
  assert.equal(sent[1].payload.force, true);
});
function helper() {
  const module = { exports: {} };
  const localRequire = createRequire(path.resolve("node_helper.js"));
  vm.runInNewContext(fs.readFileSync("node_helper.js", "utf8"), { module, require: name => name === "node_helper" ? { create: x => x } : localRequire(name), __dirname: path.resolve("."), console, structuredClone });
  const instance = module.exports;
  const sent = [];
  instance.sendSocketNotification = (type, payload) => sent.push({ type, payload });
  instance.start();
  return { instance, sent };
}
test("helper sends schedule before slow logos and never sends stale enrichment", async () => {
  const { instance, sent } = helper();
  let finish;
  const logos = new Promise(resolve => { finish = resolve; });
  instance.service = { schedule: async () => ({ data: schedule(), lastUpdated: "now" }), logos: { enrich: async data => { await logos; return data; } } };
  const first = instance.socketNotificationReceived("SCHOOL_ATHLETICS_FETCH_EVENTS", { instanceId: "one", requestId: 1, config });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[0].type, "SCHOOL_ATHLETICS_EVENTS");
  const second = instance.socketNotificationReceived("SCHOOL_ATHLETICS_FETCH_EVENTS", { instanceId: "one", requestId: 2, config });
  await new Promise(resolve => setImmediate(resolve));
  finish();
  await Promise.all([first, second]);
  assert.equal(sent.filter(e => e.type === "SCHOOL_ATHLETICS_LOGOS").length, 1);
  assert.equal(sent.at(-1).payload.requestId, 2);
});
test("helper ignores malformed notifications and isolates logo failures", async () => {
  const { instance, sent } = helper();
  await instance.socketNotificationReceived("SCHOOL_ATHLETICS_FETCH_EVENTS", null);
  assert.equal(sent.length, 0);
  instance.service = { schedule: async () => ({ data: schedule(), lastUpdated: "now" }), logos: { enrich: async () => { throw new Error("fixture logo failure"); } } };
  await instance.socketNotificationReceived("SCHOOL_ATHLETICS_FETCH_EVENTS", { instanceId: "one", requestId: 1, config });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "SCHOOL_ATHLETICS_EVENTS");
});

test("fresh or blank calendar renders neutral setup without requests or timers", () => {
  for (const calendarUrl of [undefined, null, "", "  \n "]) {
    const { instance, sent, timers } = frontend({ calendarUrl });
    assert.equal(instance.getDom().textContent, "School Athletics Setup required");
    instance.fetchEvents();
    instance.resume();
    instance.notificationReceived("DOM_OBJECTS_CREATED");
    instance.socketNotificationReceived("SCHOOL_ATHLETICS_EVENTS", { instanceId: "one", requestId: 0, data: schedule() });
    assert.equal(instance.getDom().textContent, "School Athletics Setup required");
    assert.equal(instance.schedule, null);
    assert.equal(sent.length, 0);
    assert.equal(timers.size, 0);
  }
});

test("helper rejects missing calendars before schedule or logo work", async () => {
  const { instance, sent } = helper();
  let calls = 0;
  instance.service = { schedule: async () => { calls++; }, logos: { enrich: async () => { calls++; } } };
  for (const config of [{}, { calendarUrl: "" }, { calendarUrl: "   " }]) {
    await instance.socketNotificationReceived("SCHOOL_ATHLETICS_FETCH_EVENTS", { instanceId: "one", requestId: 1, config });
  }
  assert.equal(calls, 0);
  assert.equal(sent.length, 3);
  assert.ok(sent.every(reply => reply.type === "SCHOOL_ATHLETICS_EVENTS_ERROR"));
});

test("runtime defaults have no school identity, feed, images, aliases, or fixed timezone", () => {
  const defaults = require("../shared/config").defaults();
  for (const key of ["calendarUrl", "schoolName", "arbiterSchoolId", "schoolLogo", "backgroundImage", "timeZone"]) assert.equal(defaults[key], "");
  assert.equal(defaults.logos.fallbackImage, "");
  assert.deepEqual(defaults.logos.overrides, []);
  assert.deepEqual(defaults.homeKeywords, []);
  assert.deepEqual(defaults.theme, { homeAccent: "#ffffff", awayAccent: "#bdbdbd" });
  assert.equal(Object.hasOwn(defaults, "weather"), false);
  assert.doesNotMatch(fs.readFileSync("MMM-SchoolAthletics.css", "utf8"), /url\s*\(/i);
});

test("runtime does not import setup fixtures or use environment school fallbacks", () => {
  const files = ["MMM-SchoolAthletics.js", "node_helper.js", "shared/config.js", ...fs.readdirSync("lib").filter(name => name.endsWith(".js")).map(name => `lib/${name}`)];
  for (const file of files) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /(?:require\s*\(|from\s+|import\s*\()[^\n]*setup\/|SchoolAthleticsPreview|mockData|process\.env/, file);
  }
  const { instance } = frontend();
  instance.file = file => file;
  assert.deepEqual(Array.from(instance.getScripts()), ["shared/config.js", "shared/layout.js"]);
  assert.deepEqual(Array.from(instance.getStyles()), ["MMM-SchoolAthletics.css"]);
  assert.equal(instance.schedule, undefined);
  instance.suspend();
});
