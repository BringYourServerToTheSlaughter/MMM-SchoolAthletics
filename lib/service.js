"use strict";
const { createHash } = require("node:crypto");
const { Network } = require("./network");
const { LogoService } = require("./logos");
const { parseInWorker } = require("./parser");
const { assertCalendar, dateKey } = require("./calendar");
class AthleticsService {
  constructor({ root, network = new Network(), parse = parseInWorker, logos, now = Date.now } = {}) {
    this.network = network;
    this.parse = parse;
    this.now = now;
    this.logos = logos || new LogoService({ network, root, now });
    this.parsed = new Map();
    this.pending = new Map();
  }
  async schedule(config, { force = false } = {}) {
    const response = await this.network.text(config.calendarUrl, { kind: "calendar", ttl: force ? 0 : config.refreshInterval, validate: assertCalendar });
    const now = this.now();
    const options = { timeZone: config.timeZone, homeKeywords: config.homeKeywords, unknownGamePolicy: config.unknownGamePolicy, showCancelled: config.showCancelled, upcomingCount: config.upcomingCount, lookAheadDays: config.lookAheadDays };
    const key = createHash("sha256").update(response.text).update(JSON.stringify(options)).update(dateKey(now, config.timeZone)).digest("hex");
    if (!this.parsed.has(key)) {
      if (!this.pending.has(key)) {
        if (this.pending.size >= 2) throw new Error("Calendar parser is busy; retry shortly.");
        const work = Promise.resolve().then(() => this.parse(response.text, config, now)).then(data => {
          this.parsed.set(key, data);
          while (this.parsed.size > 16) this.parsed.delete(this.parsed.keys().next().value);
          return data;
        });
        this.pending.set(key, work);
      }
      try { await this.pending.get(key); } finally { this.pending.delete(key); }
    }
    return { data: structuredClone(this.parsed.get(key)), lastUpdated: new Date(response.checkedAt).toISOString() };
  }
}
module.exports = { AthleticsService };
