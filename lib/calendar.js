"use strict";
const ical = require("node-ical");

function dateKey(value, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function localKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(key, days) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function classify(summary, location, config) {
  const match = summary.match(/^(.*?)\s+(@|vs\.?)\s+(.+)$/i);
  if (match) return { kind: match[2] === "@" ? "away" : "home", team: match[1].trim(), opponent: match[3].trim() };
  const home = config.homeKeywords.some(keyword => location.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
  return { kind: home ? "home" : (config.unknownGamePolicy === "hide" ? "hidden" : config.unknownGamePolicy), team: summary, opponent: "" };
}
function assertCalendar(text) {
  if (!/^BEGIN:VCALENDAR\s*$/mi.test(text) || !/^END:VCALENDAR\s*$/mi.test(text)) throw new Error("Arbiter did not return a valid iCalendar document.");
  const opens = (text.match(/^BEGIN:VEVENT\s*$/gm) || []).length;
  const closes = (text.match(/^END:VEVENT\s*$/gm) || []).length;
  if (opens !== closes || opens > 5000) throw new Error("Calendar contains incomplete or too many events.");
}
function prepare(text, timeZone) {
  assertCalendar(text);
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  // Give floating DATE-TIME properties an explicit school timezone. DATE values remain calendar dates.
  return unfolded.split(/\r?\n/).map(line => {
    const match = line.match(/^(DTSTART|DTEND|RECURRENCE-ID|EXDATE|RDATE)(;[^:]*)?:(.+)$/i);
    if (!match) return line;
    if (/RANGE=THISANDFUTURE/i.test(match[2] || "")) throw new Error("RANGE=THISANDFUTURE overrides are not supported; use individual overrides.");
    const tzid = (match[2] || "").match(/TZID=(?:"([^"]+)"|([^;]+))/i);
    if (tzid) {
      try { new Intl.DateTimeFormat("en-US", { timeZone: tzid[1] || tzid[2] }); }
      catch { throw new Error("Calendar contains an unsupported timezone; use an IANA timezone."); }
    }
    const values = match[3].split(",");
    for (const value of values) {
      if (/\//.test(value)) throw new Error("RDATE periods are not supported; use individual event instances.");
      const parts = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
      if (!parts) throw new Error("Calendar contains an invalid date.");
      const [, y, m, d, h = "0", min = "0", s = "0"] = parts;
      const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s));
      if (+y < 1900 || date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d || +h > 23 || +min > 59 || +s > 59) throw new Error("Calendar contains an invalid date.");
    }
    if (!/TZID=/i.test(match[2] || "") && values.every(v => /^\d{8}T\d{4,6}$/.test(v))) return `${match[1]}${match[2] || ""};TZID=${timeZone}:${match[3]}`;
    return line;
  }).join("\r\n");
}
function textValue(value) { return String(value?.val ?? value ?? "").replace(/\s+/g, " ").trim(); }
function withAdditionalDates(event) {
  if (!event.rdate) return event;
  const dates = [];
  for (const property of Array.isArray(event.rdate) ? event.rdate : [event.rdate]) {
    const params = Object.entries(property.params || {}).map(([key, value]) => `;${key}=${value}`).join("");
    for (const value of String(property.val ?? property).split(",")) {
      const parsed = ical.sync.parseICS(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:rdate\r\nDTSTART${params}:${value}\r\nEND:VEVENT\r\nEND:VCALENDAR`).rdate;
      if (Boolean(parsed.start.dateOnly) !== Boolean(event.start.dateOnly)) throw new Error("RDATE and DTSTART must use the same date type.");
      dates.push(parsed.start);
    }
  }
  const rule = event.rrule;
  // The expansion API consumes between(); include RDATE in that set so its normal
  // EXDATE, moved-override, duration and overlap handling applies to every occurrence.
  return { ...event, rrule: { between(from, to, inclusive) {
    const values = [...(rule ? rule.between(from, to, inclusive) : [event.start]), ...dates];
    return [...new Map(values.filter(date => date >= from && date <= to).map(date => [+date, date])).values()].sort((a, b) => a - b);
  } } };
}
function parseSchedule(text, config, now = Date.now()) {
  const parsed = ical.sync.parseICS(prepare(text, config.timeZone));
  const today = dateKey(now, config.timeZone);
  const lastDay = addDays(today, config.lookAheadDays);
  // Wide UTC bounds include floating all-day dates in every host/school timezone.
  const from = new Date(`${addDays(today, -2)}T00:00:00Z`);
  const to = new Date(`${addDays(lastDay, 2)}T23:59:59Z`);
  const result = { date: today, home: { today: [], upcoming: [] }, away: { today: [], upcoming: [] } };
  const seen = new Set();
  let count = 0;
  for (const event of Object.values(parsed)) {
    if (event.type !== "VEVENT") continue;
    if (!(event.start instanceof Date) || !Number.isFinite(+event.start)) throw new Error("Calendar event has no valid start date.");
    const instances = ical.expandRecurringEvent(withAdditionalDates(event), { from, to, expandOngoing: true });
    count += instances.length;
    if (count > 10000) throw new Error("Calendar expansion exceeds 10,000 occurrences.");
    for (const instance of instances) {
      const summary = textValue(instance.summary) || "Untitled event";
      const location = textValue(instance.event.location ?? event.location);
      const classification = classify(summary, location, config);
      const cancelled = textValue(instance.event.status ?? event.status).toUpperCase() === "CANCELLED" || /\bcancel(?:led|ed)\b/i.test(summary);
      if (classification.kind === "hidden" || (cancelled && !config.showCancelled)) continue;
      const startDate = instance.isFullDay ? localKey(instance.start) : dateKey(instance.start, config.timeZone);
      // DTEND is exclusive; an event ending exactly at midnight does not occupy the next day.
      const endDate = instance.isFullDay ? addDays(localKey(instance.end), -1) : dateKey(new Date(Math.max(+instance.start, +instance.end - 1)), config.timeZone);
      const id = `${event.uid || summary}:${instance.start.toISOString()}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const game = { ...classification, id, summary, location, start: instance.start.toISOString(), date: startDate, allDay: instance.isFullDay, cancelled };
      const group = result[classification.kind];
      if (startDate <= today && (endDate >= today || startDate === today)) group.today.push(game);
      else if (startDate > today && startDate <= lastDay) group.upcoming.push(game);
    }
  }
  for (const kind of ["home", "away"]) {
    const compare = (a, b) => a.date.localeCompare(b.date) || Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.team.localeCompare(b.team);
    result[kind].today.sort(compare);
    result[kind].upcoming.sort(compare);
    result[kind].upcoming = result[kind].upcoming.slice(0, config.upcomingCount);
  }
  return result;
}
module.exports = { parseSchedule, classify, dateKey, assertCalendar, prepare };
