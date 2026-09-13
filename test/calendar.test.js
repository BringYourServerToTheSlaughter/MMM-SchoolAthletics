"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize } = require("../shared/config");
const { parseSchedule, classify } = require("../lib/calendar");
const { parseInWorker } = require("../lib/parser");
const config = extra => normalize({ calendarUrl: "https://www.arbiterlive.com/calendar/example.ics", timeZone: "America/Denver", unknownGamePolicy: "home", ...extra });
const feed = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join("\r\n")}\r\nEND:VCALENDAR`;
const event = (uid, properties) => `BEGIN:VEVENT\r\nUID:${uid}\r\n${properties}\r\nEND:VEVENT`;
const now = Date.parse("2026-09-12T18:00:00Z");
test("classification respects title markers, home venues, and every unknown policy", () => {
  const c = config({ homeKeywords: ["Main Stadium"] });
  assert.equal(classify("Football @ North HS", "Main Stadium", c).kind, "away");
  assert.equal(classify("Football at North HS", "", c).opponent, "");
  assert.equal(classify("Soccer vs. East HS", "", c).kind, "home");
  assert.equal(classify("Tournament", "Main Stadium Field 2", c).kind, "home");
  for (const [policy, expected] of [["home", "home"], ["away", "away"], ["hide", "hidden"]]) assert.equal(classify("Tournament", "Elsewhere", config({ unknownGamePolicy: policy })).kind, expected);
});
test("UTC, floating, and IANA times fall on the school's day; all-day dates stay dates", () => {
  const data = parseSchedule(feed(
    event("utc", "DTSTART:20260913T003000Z\r\nSUMMARY:Football @ North HS"),
    event("floating", "DTSTART:20260912T180000\r\nSUMMARY:Soccer vs East HS"),
    event("tz", "DTSTART;TZID=America/New_York:20260912T190000\r\nSUMMARY:Tennis vs West HS"),
    event("all", "DTSTART;VALUE=DATE:20260912\r\nSUMMARY:Meet")
  ), config(), now);
  assert.equal(data.away.today.length, 1);
  assert.equal(data.home.today.find(e => e.team === "Soccer").start, "2026-09-13T00:00:00.000Z");
  assert.equal(data.home.today.find(e => e.team === "Tennis").start, "2026-09-12T23:00:00.000Z");
  assert.equal(data.home.today.find(e => e.team === "Meet").date, "2026-09-12");
  assert.equal(data.home.today.find(e => e.team === "Meet").allDay, true);
});
test("zero upcoming, cancellations, ongoing multiday events, and exclusive DTEND", () => {
  const data = parseSchedule(feed(
    event("multi", "DTSTART;VALUE=DATE:20260911\r\nDTEND;VALUE=DATE:20260913\r\nSUMMARY:Meet"),
    event("ended", "DTSTART;VALUE=DATE:20260911\r\nDTEND;VALUE=DATE:20260912\r\nSUMMARY:Ended"),
    event("cancelled", "DTSTART:20260912T180000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Soccer vs East HS"),
    event("next", "DTSTART:20260914T180000Z\r\nSUMMARY:Soccer vs East HS")
  ), config({ upcomingCount: 0, showCancelled: false }), now);
  assert.deepEqual(data.home.today.map(e => e.team), ["Meet"]);
  assert.equal(data.home.today.length, 1);
  assert.equal(data.home.upcoming.length, 0);
});
test("recurrence honors EXDATE and a moved override", () => {
  const data = parseSchedule(feed(
    event("series", "DTSTART;TZID=America/Denver:20260912T180000\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE;TZID=America/Denver:20260913T180000\r\nSUMMARY:Soccer vs East HS"),
    event("series", "RECURRENCE-ID;TZID=America/Denver:20260914T180000\r\nDTSTART;TZID=America/Denver:20260914T200000\r\nSUMMARY:Soccer @ West HS")
  ), config(), now);
  assert.equal(data.home.today.length, 1);
  assert.deepEqual(data.home.upcoming.map(e => e.date), ["2026-09-15"]);
  assert.equal(data.away.upcoming[0].start, "2026-09-15T02:00:00.000Z");
});
test("weekly recurrence retains wall time over DST", () => {
  const data = parseSchedule(feed(event("dst", "DTSTART;TZID=America/Denver:20261025T180000\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nSUMMARY:Soccer vs East HS")), config(), Date.parse("2026-10-25T18:00:00Z"));
  assert.equal(data.home.today[0].start, "2026-10-26T00:00:00.000Z");
  assert.equal(data.home.upcoming[0].start, "2026-11-02T01:00:00.000Z");
});
test("bad feeds and invalid dates fail instead of erasing the schedule", () => {
  for (const source of ["<html>Login</html>", feed(event("bad", "DTSTART:20260231T120000Z\r\nSUMMARY:Bad")), feed(event("bad", "SUMMARY:No date"))]) assert.throws(() => parseSchedule(source, config(), now));
  assert.equal(parseSchedule(feed(), config(), now).home.today.length, 0);
});
test("worker returns the same serializable schedule", async () => {
  const text = feed(event("a", "DTSTART:20260912T180000Z\r\nSUMMARY:Soccer vs East HS"));
  assert.deepEqual(await parseInWorker(text, config(), now), parseSchedule(text, config(), now));
});
module.exports = { feed, event };
test("duplicate UIDs prefer the latest sequence", () => {
  const data = parseSchedule(feed(
    event("same", "SEQUENCE:2\r\nDTSTART:20260912T180000Z\r\nSUMMARY:New vs East HS"),
    event("same", "SEQUENCE:1\r\nDTSTART:20260912T180000Z\r\nSUMMARY:Old vs East HS")
  ), config(), now);
  assert.equal(data.home.today.length, 1);
  assert.equal(data.home.today[0].team, "New");
});
test("RDATE adds timed and all-day occurrences and honors EXDATE", () => {
  const data = parseSchedule(feed(
    event("extra", "DTSTART;TZID=America/Denver:20260912T180000\r\nRDATE;TZID=America/Denver:20260914T180000,20260915T180000\r\nEXDATE;TZID=America/Denver:20260915T180000\r\nSUMMARY:Soccer vs East HS"),
    event("date", "DTSTART;VALUE=DATE:20260912\r\nRDATE;VALUE=DATE:20260914\r\nSUMMARY:Meet")
  ), config(), now);
  assert.equal(data.home.today.length, 2);
  assert.deepEqual(data.home.upcoming.filter(e => e.team === "Soccer").map(e => e.date), ["2026-09-14"]);
  assert.deepEqual(data.home.upcoming.filter(e => e.team === "Meet").map(e => e.date), ["2026-09-14"]);
});
test("unknown timezones fail explicitly rather than falling back to the host timezone", () => {
  assert.throws(() => parseSchedule(feed(event("tz", "DTSTART;TZID=Not/AZone:20260912T180000\r\nSUMMARY:Meet")), config(), now), /unsupported timezone/);
});

test("unknown games are hidden by default and never create a third group", () => {
  const c = normalize({ calendarUrl: "https://www.arbiterlive.com/calendar", timeZone: "UTC" });
  const data = parseSchedule(feed(event("unknown", "DTSTART:20260912T180000Z\r\nSUMMARY:Meet")), c, now);
  assert.deepEqual(Object.keys(data).sort(), ["away", "date", "home"]);
  assert.equal(data.home.today.length + data.away.today.length, 0);
});
