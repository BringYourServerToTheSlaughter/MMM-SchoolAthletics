"use strict";
const NodeHelper = require("node_helper");
const { normalize } = require("./shared/config");
const { AthleticsService } = require("./lib/service");

module.exports = NodeHelper.create({
  start() {
    this.service = new AthleticsService({ root: __dirname });
    this.requests = new Map();
    this.active = 0;
    this.stopped = false;
  },
  stop() { this.stopped = true; this.requests.clear(); },
  async socketNotificationReceived(notification, payload) {
    if (notification !== "SCHOOL_ATHLETICS_FETCH_EVENTS" || !payload ||
        typeof payload.instanceId !== "string" || payload.instanceId.length > 200 ||
        !Number.isSafeInteger(payload.requestId) || payload.requestId < 1) return;
    const { instanceId, requestId } = payload;
    const reply = (type, data) => this.sendSocketNotification(type, { instanceId, requestId, ...data });
    if (this.stopped) return;
    if (this.active >= 16 || (!this.requests.has(instanceId) && this.requests.size >= 64)) {
      reply("SCHOOL_ATHLETICS_EVENTS_ERROR", { message: "Athletics service is busy; retry shortly." });
      return;
    }
    const revision = Symbol();
    this.requests.set(instanceId, revision);
    const current = () => !this.stopped && this.requests.get(instanceId) === revision;
    this.active++;
    try {
      const config = normalize(payload.config);
      const { data, lastUpdated } = await this.service.schedule(config, { force: payload.force === true });
      if (!current()) return;
      reply("SCHOOL_ATHLETICS_EVENTS", { data, lastUpdated });
      // Deliver the calendar before optional, potentially slow logo discovery.
      try {
        const enriched = await this.service.logos.enrich(structuredClone(data), config);
        if (current()) reply("SCHOOL_ATHLETICS_LOGOS", {
          logos: Object.fromEntries(["home", "away"].flatMap(kind => enriched[kind].today).map(game => [game.id, game.logoUrl || null]))
        });
      } catch (error) {
        console.warn(`[MMM-SchoolAthletics] Logo enrichment skipped: ${error.message}`);
      }
    } catch (error) {
      if (current()) reply("SCHOOL_ATHLETICS_EVENTS_ERROR", { message: error.message || "Unable to load the athletics calendar." });
    } finally {
      this.active--;
      if (current()) this.requests.delete(instanceId);
    }
  }
});
