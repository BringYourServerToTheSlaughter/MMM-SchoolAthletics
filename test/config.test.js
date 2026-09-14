"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { normalize, defaults, schema, imageUrl } = require("../shared/config");
const base = { calendarUrl: "https://www.arbiterlive.com/calendar/test.ics" };
test("schema and shared defaults stay aligned and JSON-safe", () => {
  assert.deepEqual(JSON.parse(fs.readFileSync("config.schema.json")), schema);
  assert.deepEqual(JSON.parse(JSON.stringify(defaults())), defaults());
  const c = normalize({ ...base, upcomingCount: 0, logos: { enabled: false } });
  assert.equal(c.upcomingCount, 0);
  assert.equal(c.logos.enabled, false);
  assert.equal(c.logos.cache.maxBytes, 52428800);
});
test("invalid options cannot reach a timer, formatter, or URL fetch", () => {
  for (const extra of [{ refreshInterval: "fast" }, { upcomingCount: -1 }, { timeZone: "garbage" }, { homeKeywords: [""] }, { arbiterSchoolId: "abc" }, { theme: { homeAccent: "red; background:url(x)" } }, { logos: { mystery: true } }, { logos: { overrides: [{ opponent: "East" }] } }]) assert.throws(() => normalize({ ...base, ...extra }));
  for (const calendarUrl of ["", "http://arbiterlive.com/x", "https://arbiterlive.com.attacker.test/x", "https://localhost/x", "https://user:pass@arbiterlive.com/x", "https://arbiterlive.com:8443/x"]) assert.throws(() => normalize({ calendarUrl }));
});
test("manual image fields accept local PNG/SVG and HTTPS but reject active/traversal URLs", () => {
  for (const value of ["/modules/MMM-SchoolAthletics/images/east.svg", "https://example.org/east.png"]) assert.equal(imageUrl(value), value);
  for (const value of ["javascript:alert(1)", "data:image/svg+xml,x", "//example.org/x", "/modules/../config.js", "/modules/a/%2e%2e/x"]) assert.throws(() => imageUrl(value));
});

test("Stage 2A defaults, refresh clamping, and missing optional identity", () => {
  const c = normalize(base);
  assert.equal(c.refreshInterval, 1800000);
  assert.equal(c.unknownGamePolicy, "hide");
  assert.equal(c.schoolName, "");
  assert.equal(c.logos.autoDiscover, true);
  assert.ok(c.timeZone);
  for (const refreshInterval of [-1, 0, 1, 60000, 899999]) assert.equal(normalize({ ...base, refreshInterval }).refreshInterval, 900000);
  assert.equal(normalize({ ...base, schoolName: "Example School" }).schoolName, "Example School");
  assert.throws(() => normalize({ ...base, unknownGamePolicy: "separate" }));
  assert.equal(imageUrl("logos/example.png"), "/modules/MMM-SchoolAthletics/logos/example.png");
});
test("display fonts use a small local allowlist and preserve the existing default", () => {
  assert.equal(defaults().displayFont, "default");
  for (const value of ["default", "arial", "verdana", "trebuchet", "georgia", "montserrat", "oswald", "robotoSlab", "merriweather", "bebasNeue"]) assert.equal(normalize({ ...base, displayFont: value }).displayFont, value);
  assert.throws(() => normalize({ ...base, displayFont: "https://fonts.example/font" }));
});
test("bundled display fonts and their license texts are local and complete", () => {
  const fonts = ["montserrat", "oswald", "roboto-slab", "merriweather", "bebas-neue"];
  for (const name of fonts) {
    const asset = path.join("fonts", `${name}-latin.woff2`);
    assert.equal(fs.readFileSync(asset).subarray(0, 4).toString("ascii"), "wOF2", asset);
  }
  for (const license of ["Montserrat-OFL-1.1.txt", "Oswald-OFL-1.1.txt", "RobotoSlab-Apache-2.0.txt", "Merriweather-OFL-1.1.txt", "BebasNeue-OFL-1.1.txt"]) assert.ok(fs.readFileSync(path.join("fonts/licenses", license), "utf8").length > 1000, license);
  const runtime = fs.readFileSync("MMM-SchoolAthletics.css", "utf8"), preview = fs.readFileSync("setup/preview.css", "utf8");
  for (const name of fonts) {
    assert.match(runtime, new RegExp(`fonts/${name}-latin\\.woff2`));
    assert.match(preview, new RegExp(`fonts/${name}-latin\\.woff2`));
  }
});
