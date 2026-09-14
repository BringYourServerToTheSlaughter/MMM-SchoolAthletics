"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const preview = require("../setup/preview-model");
const values = { schoolName: "Example Academy", accentColor: "#123456", schoolLogo: "images/logo.png", backgroundImage: "images/background.jpg", displayFont: "georgia", showDateTime: true, showSchoolName: true, showWeather: false };
const controls = { preset: "1920x1080", safeArea: false, mode: "typical" };
test("preview presets have their exact logical resolutions", () => {
  assert.deepEqual(Object.values(preview.presets), [[1920,1080],[3840,2160],[1366,768],[1920,1200]]);
  for (const [key, [width, height]] of Object.entries(preview.presets)) assert.deepEqual(preview.resolution(key), { width, height });
});
test("custom resolution validates both bounded whole-number dimensions", () => {
  assert.deepEqual(preview.resolution("custom", "2560", "1600"), { width:2560, height:1600 });
  for (const bad of ["", "1.5", 0, 319, 7681, Infinity, NaN, null, "1920px"]) {
    assert.throws(() => preview.resolution("custom", bad, 1080));
    assert.throws(() => preview.resolution("custom", 1920, bad));
  }
  assert.throws(() => preview.resolution("invalid"));
});
test("mock stress modes select isolated generic datasets", () => {
  assert.equal(preview.mockData("typical").home.length, 3);
  assert.equal(preview.mockData("maximum").away.length, 16);
  assert.ok(preview.mockData("long").home[0].opponent.length > 70);
  const a = preview.mockData("typical"); a.home[0].team = "changed";
  assert.notEqual(preview.mockData("typical").home[0].team, "changed");
  assert.throws(() => preview.mockData("unknown"));
});
test("preview state reuses setup values without mutating config", () => {
  const before = JSON.stringify(values);
  const state = preview.state(values, controls);
  for (const key of Object.keys(values)) assert.equal(state[key], values[key]);
  assert.equal(JSON.stringify(values), before);
  assert.equal(preview.state({}, controls).schoolName, "Example High School");
  assert.equal(state.displayFont, "georgia");
});
test("header toggles are independent and safe-area changes do not change game layout state", () => {
  for (const key of ["showDateTime", "showSchoolName", "showWeather"]) assert.equal(preview.state({ ...values, [key]: false }, controls)[key], false);
  const off = preview.state(values, controls);
  const on = preview.state(values, { ...controls, safeArea:true });
  assert.equal(on.safeArea, true);
  assert.deepEqual({ ...on, safeArea:false }, off);
});
test("fit scaling preserves aspect ratio and 4K composition size", () => {
  const hd = preview.resolution("1920x1080"), uhd = preview.resolution("3840x2160");
  const a = preview.scale(hd, 736), b = preview.scale(uhd, 736);
  assert.equal(hd.width*a, uhd.width*b);
  assert.equal(hd.height*a, uhd.height*b);
  assert.ok(hd.height*preview.scale(hd, 2000) <= 480);
});
test("overflow measurements detect header, vertical pane, and clipped row bounds", () => {
  assert.equal(preview.overflows([{ clientWidth:100, scrollWidth:100, clientHeight:100, scrollHeight:100 }]), false);
  assert.equal(preview.overflows([{ clientWidth:100, scrollWidth:120 }]), true);
  assert.equal(preview.overflows([{ clientHeight:100, scrollHeight:120 }]), true);
  const limit = {left:0, right:100, top:0, bottom:100};
  assert.equal(preview.overflows([{ bounds:{...limit,bottom:120}, limit }]), true);
  assert.equal(preview.overflows([{ bounds:{...limit,bottom:100.5}, limit }]), false);
});

 test("school logo belongs to Home heading rather than the school-name band", () => {
  const html = require("node:fs").readFileSync("setup/preview.html", "utf8");
  assert.match(html, /<section class="pane home"><h2><img id="school-logo"[^>]*><span>HOME GAMES<\/span><\/h2>/);
  assert.match(html, /<div id="school"><strong id="school-name"><\/strong><\/div>/);
  assert.match(html, /<section class="pane away"><h2>AWAY GAMES<\/h2>/);
 assert.equal((html.match(/id="school-logo"/g) || []).length, 1);
  assert.match(require("node:fs").readFileSync("setup/preview.css", "utf8"), /#school-logo \{ width: 3\.2em; height: 3\.2em;/);
});
