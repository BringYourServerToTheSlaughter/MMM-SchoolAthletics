"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { AthleticsService } = require("../lib/service");
const { normalize } = require("../shared/config");
test("identical calendars parse once and instances receive independent data", async () => {
  let parses = 0;
  const config = normalize({ calendarUrl: "https://www.arbiterlive.com/calendar", timeZone: "UTC" });
  const service = new AthleticsService({
    network: { text: async () => ({ text: "source", checkedAt: Date.now() }) }, logos: {},
    parse: async () => { parses++; await new Promise(resolve => setImmediate(resolve)); return { home: { today: [{ id: "a" }] } }; }
  });
  const [a, b] = await Promise.all([service.schedule(config), service.schedule(config)]);
  a.data.home.today[0].logoUrl = "changed";
  assert.equal(b.data.home.today[0].logoUrl, undefined);
  assert.equal(parses, 1);
  await service.schedule(config);
  assert.equal(parses, 1);
});
test("school midnight regroups a cached calendar without waiting for its TTL", async () => {
  let now = Date.parse("2026-09-12T23:59:00Z");
  let parses = 0;
  const config = normalize({ calendarUrl: "https://www.arbiterlive.com/calendar", timeZone: "UTC" });
  const service = new AthleticsService({ now: () => now, network: { text: async () => ({ text: "source", checkedAt: now }) }, logos: {}, parse: async () => { parses++; return {}; } });
  await service.schedule(config);
  now += 120000;
  await service.schedule(config);
  assert.equal(parses, 2);
});

test("resume requests a fresh calendar check", async () => {
  const calls = [];
  const config = normalize({ calendarUrl: "https://www.arbiterlive.com/calendar", timeZone: "UTC" });
  const service = new AthleticsService({ network: { text: async (url, options) => { calls.push(options); return { text: "source", checkedAt: Date.now() }; } }, logos: {}, parse: async () => ({}) });
  await service.schedule(config);
  await service.schedule(config, { force: true });
  assert.equal(calls[0].ttl, 1800000);
  assert.equal(calls[1].ttl, 0);
});
