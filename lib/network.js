"use strict";
const https = require("node:https");
const dns = require("node:dns");
const ipaddr = require("ipaddr.js");
const { arbiterUrl } = require("../shared/config");

function checkUrl(value, kind) {
  const url = new URL(value);
  if (kind === "logo") {
    if (url.protocol !== "https:" || url.hostname !== "assets.arbitersports.com" || url.username || url.password ||
        (url.port && url.port !== "443") || !/^\/logos\/organization\/\d+\/?$/.test(url.pathname)) throw new Error("Rejected unexpected logo URL.");
  } else arbiterUrl(url.href);
  return url;
}
function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      return callback(new Error("Blocked non-public network destination."));
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}
class Network {
  constructor({ request = https.get, lookup = publicLookup, now = Date.now } = {}) {
    this.request = request;
    this.lookup = lookup;
    this.now = now;
    this.active = 0;
    this.waiters = [];
    this.cache = new Map();
    this.pending = new Map();
  }
  async slot(work) {
    if (this.active >= 4) {
      if (this.waiters.length >= 64) throw new Error("Network queue is full; retry later.");
      await new Promise(resolve => this.waiters.push(resolve));
    } else this.active++;
    try { return await work(); }
    finally {
      const next = this.waiters.shift();
      if (next) next(); else this.active--;
    }
  }
  async download(value, { kind = "page", maxBytes = 2097152, headers = {} } = {}) {
    return this.slot(async () => {
      let url = checkUrl(value, kind);
      // One deadline covers DNS, all redirects, and the complete response body.
      const signal = AbortSignal.timeout(20000);
      for (let count = 0; count <= 3; count++) {
        const response = await new Promise((resolve, reject) => {
          const request = this.request(url, {
            lookup: this.lookup, signal,
            headers: { "User-Agent": "MagicMirror-SchoolAthletics/0.1", "Accept-Encoding": "identity", ...headers }
          }, incoming => {
            if ([301, 302, 303, 307, 308].includes(incoming.statusCode)) {
              incoming.resume();
              resolve({ status: incoming.statusCode, headers: incoming.headers, buffer: Buffer.alloc(0) });
              return;
            }
            const chunks = [];
            let size = 0;
            if (Number(incoming.headers["content-length"]) > maxBytes) {
              incoming.destroy(); reject(new Error("Response exceeds size limit.")); return;
            }
            incoming.on("data", chunk => {
              size += chunk.length;
              if (size > maxBytes) incoming.destroy(new Error("Response exceeds size limit."));
              else chunks.push(chunk);
            });
            incoming.on("error", reject);
            incoming.on("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, buffer: Buffer.concat(chunks) }));
          });
          request.on("error", reject);
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.headers.location || count === 3) throw new Error("Too many or invalid redirects.");
          url = checkUrl(new URL(response.headers.location, url), kind);
          continue;
        }
        if (response.status !== 304 && (response.status < 200 || response.status >= 300)) throw new Error(`Arbiter returned HTTP ${response.status}.`);
        return response;
      }
    });
  }
  async text(url, { ttl = 900000, kind = "page", validate = () => {} } = {}) {
    checkUrl(url, kind);
    const key = `${kind}:${url}`;
    const old = this.cache.get(key);
    const now = this.now();
    if (old && old.retryAt > now) throw new Error("Arbiter request is cooling down after a failure; retry later.");
    if (old && old.text !== undefined && now - old.checkedAt < ttl) return { text: old.text, checkedAt: old.checkedAt };
    if (this.pending.has(key)) return this.pending.get(key);
    const work = (async () => {
      try {
        const headers = {};
        if (old?.etag) headers["If-None-Match"] = old.etag;
        if (old?.modified) headers["If-Modified-Since"] = old.modified;
        const response = await this.download(url, { kind, headers });
        if (response.status === 304 && old?.text === undefined) throw new Error("Unexpected calendar revalidation response.");
        const text = response.status === 304 ? old.text : response.buffer.toString("utf8");
        validate(text);
        const entry = { text, checkedAt: this.now(), etag: response.headers.etag || old?.etag, modified: response.headers["last-modified"] || old?.modified, failures: 0 };
        this.cache.delete(key);
        this.cache.set(key, entry);
        this.trim();
        return { text, checkedAt: entry.checkedAt };
      } catch (error) {
        const failures = Math.min((old?.failures || 0) + 1, 7);
        this.cache.set(key, { ...old, failures, retryAt: this.now() + Math.min(3600000, 60000 * 2 ** (failures - 1)) });
        this.trim();
        throw error;
      }
    })();
    this.pending.set(key, work);
    try { return await work; } finally { this.pending.delete(key); }
  }
  trim() {
    let bytes = [...this.cache.values()].reduce((sum, e) => sum + Buffer.byteLength(e.text || ""), 0);
    for (const [key, entry] of this.cache) {
      if (this.cache.size <= 100 && bytes <= 16777216) break;
      bytes -= Buffer.byteLength(entry.text || "");
      this.cache.delete(key);
    }
  }
}
module.exports = { Network, checkUrl, publicLookup, isPublicAddress };
