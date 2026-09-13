"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { load } = require("cheerio/slim");
const sharp = require("sharp");
const { checkUrl } = require("./network");
const BASE = "https://www.arbiterlive.com";
const FILE = /^[a-f0-9]{64}\.png$/;
const hash = value => createHash("sha256").update(value).digest("hex");
function normalizeName(value) {
  return String(value || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/\bhigh\s+school\b/g, " hs ").replace(/\bh\.?\s*s\.?\b/g, " hs ")
    .replace(/\bmiddle\s+school\b/g, " ms ").replace(/\bm\.?\s*s\.?\b/g, " ms ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function scheduleLinks(html, schoolId) {
  const $ = load(html);
  const urls = new Set();
  $("a[href]").each((_, anchor) => {
    try {
      const url = new URL($(anchor).attr("href"), BASE);
      if (url.origin === BASE && /^\/Teams\/Schedule\/\d+$/.test(url.pathname) && url.searchParams.get("activeEntityId") === schoolId) {
        urls.add(`${url.origin}${url.pathname}?activeEntityId=${schoolId}`);
      }
    } catch { /* Ignore non-URL links. */ }
  });
  if (urls.size > 100) throw new Error("School exposes too many team schedules.");
  return [...urls];
}
function scanLogos(html, wanted, found) {
  const $ = load(html);
  // Match a name and a single logo in the SAME cell, never the first image in a row.
  $("tr[data-gameid] td").each((_, cell) => {
    const node = $(cell);
    const candidates = new Set();
    node.find("img[src]").each((_, image) => {
      try { candidates.add(checkUrl($(image).attr("src"), "logo").href); } catch { /* Not an organization logo. */ }
    });
    if (candidates.size !== 1) return;
    const names = new Set([normalizeName(node.text())]);
    node.find("a, img[alt]").each((_, element) => names.add(normalizeName(element.name === "img" ? $(element).attr("alt") : $(element).text())));
    for (const name of wanted) {
      if (!name || !names.has(name)) continue;
      const url = [...candidates][0];
      // Ambiguous associations remain misses, allowing a manual override.
      if (found.has(name) && found.get(name) !== url) found.set(name, null);
      else if (!found.has(name)) found.set(name, url);
    }
  });
}
class LogoService {
  constructor({ network, root, now = Date.now }) {
    this.network = network;
    this.now = now;
    this.dir = path.join(root, "public", "logos", "v2");
    this.metaDir = path.join(root, ".cache");
    this.indexPath = path.join(this.metaDir, "logos.json");
    this.entries = new Map();
    this.budget = 209715200;
    this.tail = Promise.resolve();
    this.initialized = false;
  }
  key(school, opponent) { return hash(`${school}\n${normalizeName(opponent)}`); }
  async init() {
    if (this.initialized) return;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.mkdir(this.metaDir, { recursive: true });
    try {
      const stat = await fs.stat(this.indexPath);
      if (stat.size <= 2097152) {
        const data = JSON.parse(await fs.readFile(this.indexPath, "utf8"));
        if (data.version === 2 && Array.isArray(data.entries)) for (const [key, entry] of data.entries.slice(0, 1000)) {
          if (/^[a-f0-9]{64}$/.test(key) && entry && Number.isFinite(entry.checkedAt) && (!entry.file || FILE.test(entry.file))) this.entries.set(key, entry);
        }
      }
    } catch { /* Missing or invalid index is rebuilt; orphaned managed files are pruned. */ }
    this.initialized = true;
  }
  async atomic(file, contents) {
    const temporary = `${file}.tmp-${randomUUID()}`;
    try { await fs.writeFile(temporary, contents, { flag: "wx" }); await fs.rename(temporary, file); }
    finally { await fs.unlink(temporary).catch(() => {}); }
  }
  async existing(entry) {
    if (!entry?.file || !FILE.test(entry.file)) return null;
    try {
      const file = path.join(this.dir, entry.file);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.size > 1048576 || stat.size === 0) {
        await fs.unlink(file).catch(() => {});
        return null;
      }
      const buffer = await fs.readFile(file);
      if (`${hash(buffer)}.png` === entry.file && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return entry.file;
      await fs.unlink(file).catch(() => {});
      return null;
    } catch { return null; }
  }
  async discover(schoolId, names) {
    const found = new Map();
    const { text } = await this.network.text(`${BASE}/School/${schoolId}`, { ttl: 3600000 });
    const links = scheduleLinks(text, schoolId);
    if (!links.length) throw new Error("No Arbiter team schedules found; check school ID or use logo overrides.");
    for (let i = 0; i < links.length; i += 4) {
      const pages = await Promise.allSettled(links.slice(i, i + 4).map(url => this.network.text(url, { ttl: 3600000 })));
      for (const page of pages) if (page.status === "fulfilled") scanLogos(page.value.text, names, found);
      if ([...names].every(name => found.get(name))) break;
    }
    return found;
  }
  async download(url) {
    const { buffer } = await this.network.download(url, { kind: "logo", maxBytes: 2097152 });
    const image = sharp(buffer, { limitInputPixels: 4194304, animated: false, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp", "gif"].includes(metadata.format)) throw new Error("Unsupported automatic logo format.");
    // Decode and re-encode to strip metadata/active content and constrain size. SVG is manual-only.
    const png = await image.resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    if (!png.length || png.length > 1048576) throw new Error("Optimized logo exceeds size limit.");
    const file = `${hash(png)}.png`;
    if (!(await this.existing({ file }))) await this.atomic(path.join(this.dir, file), png);
    return file;
  }
  enrich(data, config) {
    // Serialize discovery/cache mutations across instances, including reuse after another request finishes.
    const work = this.tail.then(() => this.enrichLocked(data, config));
    this.tail = work.catch(() => {});
    return work;
  }
  async enrichLocked(data, config) {
    if (!config.logos.enabled) return data;
    const games = ["home", "away"].flatMap(kind => data[kind].today);
    const overrides = new Map(config.logos.overrides.map(item => [normalizeName(item.opponent), item.image]));
    for (const game of games) game.logoUrl = overrides.get(normalizeName(game.opponent)) || config.logos.fallbackImage || null;
    if (!config.arbiterSchoolId) return data;
    if (!config.logos.autoDiscover && !this.initialized) {
      try { await fs.access(this.indexPath); } catch { return data; }
    }
    await this.init();
    this.budget = Math.min(this.budget, config.logos.cache.maxBytes);
    const now = this.now();
    const wanted = new Set();
    const files = new Map();
    for (const game of games) {
      const name = normalizeName(game.opponent);
      if (!name || overrides.has(name)) continue;
      const entry = this.entries.get(this.key(config.arbiterSchoolId, name));
      const file = await this.existing(entry);
      if (file && now - entry.fetchedAt < config.logos.cache.maxAge) { files.set(name, file); entry.usedAt = now; }
      if (entry?.retryAt > now) continue;
      if (file && now - entry.fetchedAt < config.logos.cache.maxAge) continue;
      wanted.add(name);
    }
    if (config.logos.autoDiscover && wanted.size) {
      let remote;
      try { remote = await this.discover(config.arbiterSchoolId, wanted); }
      catch (error) { console.warn(`[MMM-SchoolAthletics] Logo discovery: ${error.message}`); remote = new Map(); }
      const downloads = new Map();
      for (const name of wanted) {
        const key = this.key(config.arbiterSchoolId, name);
        let file;
        const url = remote.get(name);
        if (url) {
          try {
            if (!downloads.has(url)) {
              const cached = [...this.entries.values()].find(entry => entry.source === url && now - entry.fetchedAt < config.logos.cache.maxAge);
              const sharedFile = await this.existing(cached);
              downloads.set(url, sharedFile ? Promise.resolve(sharedFile) : this.download(url));
            }
            file = await downloads.get(url);
          } catch (error) { console.warn(`[MMM-SchoolAthletics] Logo download: ${error.message}`); }
        }
        if (file) {
          files.set(name, file);
          this.entries.set(key, { file, source: url, fetchedAt: now, checkedAt: now, usedAt: now, expiresAt: now + config.logos.cache.maxAge });
        } else {
          this.entries.set(key, { checkedAt: now, retryAt: now + config.logos.cache.negativeMaxAge, expiresAt: now + config.logos.cache.negativeMaxAge });
        }
      }
    }
    const retained = await this.prune();
    await this.atomic(this.indexPath, JSON.stringify({ version: 2, entries: [...this.entries] }));
    for (const game of games) {
      const name = normalizeName(game.opponent);
      if (!overrides.has(name) && this.entries.get(this.key(config.arbiterSchoolId, name))?.file === files.get(name) && retained.has(files.get(name))) game.logoUrl = `/modules/MMM-SchoolAthletics/public/logos/v2/${files.get(name)}`;
    }
    return data;
  }
  async prune() {
    const now = this.now();
    for (const [key, entry] of this.entries) if (!(entry.expiresAt > now)) this.entries.delete(key);
    const oldest = [...this.entries].sort((a, b) => (a[1].usedAt || a[1].checkedAt) - (b[1].usedAt || b[1].checkedAt));
    while (this.entries.size > 1000) this.entries.delete(oldest.shift()[0]);
    let total = 0;
    const present = new Map();
    const referenced = new Set([...this.entries.values()].map(e => e.file).filter(Boolean));
    for (const name of await fs.readdir(this.dir)) {
      const file = path.join(this.dir, name);
      const stat = await fs.lstat(file);
      if (name.includes(".tmp-") && stat.mtimeMs < now - 3600000) { await fs.unlink(file); continue; }
      if (!FILE.test(name)) continue;
      if (!stat.isFile() || !referenced.has(name)) { await fs.unlink(file); continue; }
      present.set(name, stat.size);
      total += stat.size;
    }
    for (const [key, entry] of oldest) {
      if (total <= this.budget) break;
      this.entries.delete(key);
      if (entry.file && ![...this.entries.values()].some(e => e.file === entry.file) && present.has(entry.file)) {
        total -= present.get(entry.file);
        present.delete(entry.file);
        await fs.unlink(path.join(this.dir, entry.file));
      }
    }
    for (const entry of this.entries.values()) if (entry.file && !present.has(entry.file)) { delete entry.file; delete entry.fetchedAt; }
    return new Set(present.keys());
  }
}
module.exports = { LogoService, normalizeName, scheduleLinks, scanLogos };
