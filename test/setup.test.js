"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const shared = require("../shared/config");
const setup = require("../setup/generator");
const state = extra => ({ ...setup.initialState("America/Chicago"), calendarUrl: "https://www.arbiterlive.com/calendar/example.ics", ...extra });
test("setup output is valid JavaScript and accepted by the runtime", () => {
  const result = setup.generate(state({ schoolName: 'Example "School"\nAcademy', arbiterSchoolId: "12345", accentColor: "#123456", schoolLogo: "images/school-logo.png", backgroundImage: "images/background.jpg" }));
  assert.deepEqual(result.errors, {});
  const entry = JSON.parse(JSON.stringify(vm.runInNewContext(`(${result.output})`)));
  assert.deepEqual(entry, result.entry);
  assert.equal(entry.module, "MMM-SchoolAthletics");
  assert.equal(entry.position, "middle_center");
  assert.equal(shared.normalize(entry.config).schoolLogo, "images/school-logo.png");
  assert.equal(entry.config.theme.homeAccent, "#123456");
  assert.equal(entry.config.displayFont, "default");
});
test("empty optional fields are omitted", () => {
  const { entry } = setup.generate(state({ schoolName: "   ", arbiterSchoolId: "", schoolLogo: "", backgroundImage: " " }));
  for (const name of ["schoolName", "arbiterSchoolId", "schoolLogo", "backgroundImage"]) assert.equal(Object.hasOwn(entry.config, name), false);
});
test("setup requires a valid HTTPS Arbiter URL and blocks invalid output", () => {
  for (const calendarUrl of ["", "not a url", "http://www.arbiterlive.com/calendar", "https://example.org/calendar", "https://user:pass@www.arbiterlive.com/calendar"]) {
    const result = setup.generate(state({ calendarUrl }));
    assert.match(result.errors.calendarUrl, /HTTPS Arbiter/);
    assert.equal(result.output, "");
    assert.equal(result.entry, null);
  }
});
test("setup and runtime reject unsafe image paths consistently", () => {
  for (const value of ["http://example.org/x.png", "https://example.org/x.png", "/absolute/path.png", "../x.png", "images/../x.png", "images/%2e%2e/x.png", "C:\\image.png", "images//x.png", "images/x.png?script", "data:image/png,x"]) {
    for (const field of ["schoolLogo", "backgroundImage"]) {
      assert.ok(setup.generate(state({ [field]: value })).errors[field], value);
      assert.throws(() => shared.normalize({ calendarUrl: state().calendarUrl, [field]: value }), value);
    }
  }
});
test("setup schema and hidden advanced defaults match Stage 2A", () => {
  const defaults = shared.defaults();
  const initial = setup.initialState("America/Chicago");
  assert.equal(initial.accentColor, defaults.theme.homeAccent);
  assert.equal(initial.schoolLogo, defaults.schoolLogo);
  assert.equal(initial.displayFont, "default");
  const normalized = shared.normalize(setup.generate(state()).entry.config);
  for (const key of ["refreshInterval", "upcomingCount", "showCancelled", "unknownGamePolicy", "lookAheadDays", "logos"]) assert.deepEqual(normalized[key], defaults[key]);
  assert.deepEqual(JSON.parse(fs.readFileSync("config.schema.json")), shared.schema);
});
test("checkbox choices remain page state and produce accurate companion notes", () => {
  for (const key of ["showDateTime", "showSchoolName", "showWeather"]) {
    const on = setup.generate(state({ [key]: true }));
    const off = setup.generate(state({ [key]: false }));
    assert.deepEqual(on.entry, off.entry);
    assert.notEqual(on.output, off.output);
    assert.equal(Object.hasOwn(on.entry.config, key), false);
  }
  const result = setup.generate(state({ showWeather: true }));
  assert.ok(result.notes.some(note => note.includes("top_right") && note.includes("provider")));
  assert.equal(result.entry.module, "MMM-SchoolAthletics");
});
test("timezone selection is explicit, validated, and independent of one school's locale", () => {
  assert.equal(setup.initialState("Asia/Tokyo").timeZone, "Asia/Tokyo");
  assert.equal(setup.initialState("Not/AZone").timeZone, "UTC");
  assert.ok(setup.generate(state({ timeZone: "Not/AZone" })).errors.timeZone);
  assert.ok(setup.generate(state({ accentColor: "red;url(x)" })).errors.accentColor);
  assert.ok(setup.generate(state({ arbiterSchoolId: "letters" })).errors.arbiterSchoolId);
});
test("setup assets are local and policy blocks network requests/form submission", () => {
  const html = fs.readFileSync("setup/index.html", "utf8");
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g).filter(([, asset]) => !/^https?:\/\//.test(asset))) {
    assert.ok(!/^(?:https?:)?\/\//.test(asset));
    assert.ok(fs.existsSync(path.resolve("setup", asset)));
  }
  assert.match(html, /id="generated-config" readonly/);
  assert.doesNotMatch(fs.readFileSync("setup/setup.js", "utf8"), /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
  assert.match(html, /Subscribing-to-iCal-Feed-Schools/);
  assert.match(html, /entityId=12345/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<label for="displayFont">Display Font<\/label>/);
});

test("display font selection is generated as runtime configuration", () => {
  for (const displayFont of ["georgia", "montserrat", "oswald", "robotoSlab", "merriweather", "bebasNeue"]) {
    const result = setup.generate(state({ displayFont }));
    assert.deepEqual(result.errors, {});
    assert.equal(result.entry.config.displayFont, displayFont);
    assert.ok(result.output.includes(`"displayFont": "${displayFont}"`));
  }
});

function formHarness(clipboard) {
  const ids = ["setup-form", "generated-config", "copy-config", "copy-status", "companion-notes", "accentColor-value", "form-error", "output-help"];
  const stateKeys = Object.keys(setup.initialState("UTC"));
  const nodes = new Map();
  function node(id = "") {
    return { id, type: id.startsWith("show") ? "checkbox" : "text", tagName: id === "timeZone" ? "SELECT" : "INPUT", value: "", textContent: "", children: [], attributes: {}, handlers: {},
      appendChild(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; },
      setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(name, fn) { this.handlers[name] = fn; },
      focus() { this.focused = true; }, select() { this.selected = true; }
    };
  }
  for (const id of [...ids, ...stateKeys, ...stateKeys.map(key => `${key}-error`)]) nodes.set(id, node(id));
  const context = vm.createContext({ SchoolAthleticsSetup: setup, SchoolAthleticsConfig: shared, Intl, navigator: { clipboard }, document: { getElementById: id => nodes.get(id), createElement: () => node() } });
  vm.runInContext(fs.readFileSync("setup/setup.js", "utf8"), context);
  function change(id, value) {
    const control = nodes.get(id);
    if (control.type === "checkbox") control.checked = value; else control.value = value;
    nodes.get("setup-form").handlers.input({ target: control });
  }
  return { nodes, change };
}
test("form generates on edit, shows validation, and copies only current valid output", async () => {
  let copied;
  const { nodes, change } = formHarness({ writeText: async text => { copied = text; } });
  assert.equal(nodes.get("copy-config").disabled, true);
  change("calendarUrl", "http://www.arbiterlive.com/calendar");
  assert.match(nodes.get("calendarUrl-error").textContent, /HTTPS/);
  assert.equal(nodes.get("calendarUrl").attributes["aria-invalid"], "true");
  change("calendarUrl", state().calendarUrl);
  assert.equal(nodes.get("copy-config").disabled, false);
  change("showWeather", true);
  assert.match(nodes.get("generated-config").value, /top_right/);
  await nodes.get("copy-config").handlers.click();
  assert.equal(copied, nodes.get("generated-config").value);
  assert.equal(nodes.get("copy-status").textContent, "Copied");
  change("schoolLogo", "../bad.png");
  assert.equal(nodes.get("generated-config").value, "");
  assert.equal(nodes.get("copy-config").disabled, true);
});
test("clipboard unavailability selects output and gives keyboard-copy instructions", async () => {
  const { nodes, change } = formHarness(undefined);
  change("calendarUrl", state().calendarUrl);
  await nodes.get("copy-config").handlers.click();
  assert.equal(nodes.get("generated-config").focused, true);
  assert.equal(nodes.get("generated-config").selected, true);
  assert.match(nodes.get("copy-status").textContent, /Ctrl\+C/);
  let prevented = false;
  nodes.get("setup-form").handlers.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test("module output remains the default and accepts legacy state without a mode", () => {
  const legacy = state();
  delete legacy.outputMode;
  assert.equal(setup.generate(legacy).output, setup.generate(state({ outputMode: "module" })).output);
  assert.equal(setup.initialState("UTC").outputMode, "module");
});

test("clean output is a replacement modules property containing only athletics and optional clock", () => {
  for (const showDateTime of [true, false]) {
    for (const showWeather of [true, false]) {
      const result = setup.generate(state({ outputMode: "clean", showDateTime, showWeather, schoolName: 'Example "Academy"' }));
      assert.deepEqual(result.errors, {});
      assert.match(result.output, /modules: \[/);
      const config = JSON.parse(JSON.stringify(vm.runInNewContext(`({\n${result.output}\n})`)));
      assert.deepEqual(config.modules.map(entry => entry.module), ["clock", "MMM-SchoolAthletics"]);
      if (showDateTime) assert.deepEqual(config.modules[0], { module: "clock", position: "top_left" });
      const athletics = config.modules.at(-1);
      assert.deepEqual(athletics, result.entry);
      assert.equal(shared.normalize(athletics.config).schoolName, 'Example "Academy"');
      assert.equal(Object.hasOwn(athletics.config, "outputMode"), false);
      assert.doesNotMatch(result.output, /alert|updatenotification|compliments|newsfeed|US holidays|New York|New_York|"module": "calendar"|apiKey|latitude|longitude|"provider"|"location"/i);
      assert.match(result.output, /Apply preserves one existing current-weather widget/);
    }
  }
});

test("output selector updates replacement instructions and copied text", async () => {
  let copied;
  const { nodes, change } = formHarness({ writeText: async text => { copied = text; } });
  change("calendarUrl", state().calendarUrl);
  nodes.get("outputMode").value = "clean";
  nodes.get("outputMode").handlers.change();
  assert.match(nodes.get("output-help").textContent, /Replace the entire existing/);
  await nodes.get("copy-config").handlers.click();
  assert.match(copied, /modules: \[/);
  nodes.get("outputMode").value = "module";
  nodes.get("outputMode").handlers.change();
  assert.equal(vm.runInNewContext(`(${nodes.get("generated-config").value})`).module, "MMM-SchoolAthletics");
  assert.equal(setup.generate(state({ outputMode: "invalid" })).output, "");
});
