"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { LogoService, normalizeName, scheduleLinks, scanLogos } = require("../lib/logos");
const { normalize } = require("../shared/config");
const asset = "https://assets.arbitersports.com/logos/organization/123";
const config = extra => normalize({ calendarUrl: "https://www.arbiterlive.com/calendar", arbiterSchoolId: "42", logos: { autoDiscover: true, ...extra } });
const games = () => ({ home: { today: [{ id: "a", opponent: "East High School" }, { id: "b", opponent: "East HS" }], upcoming: [] }, away: { today: [], upcoming: [] }, unknown: { today: [], upcoming: [] } });
async function fixture(t) {
  await fs.mkdir(path.resolve(".cache"), { recursive: true });
  const root = await fs.mkdtemp(path.join(path.resolve(".cache"), "test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: "red" } }).png().toBuffer();
  let downloads = 0;
  const service = new LogoService({ root, network: { download: async () => { downloads++; return { buffer: png }; } } });
  let discoveries = 0;
  service.discover = async () => { discoveries++; return new Map([["east hs", asset]]); };
  return { root, service, downloads: () => downloads, discoveries: () => discoveries, png };
}
test("discovery uses dynamic school IDs and same-cell exact names", () => {
  const urls = scheduleLinks('<a href="/Teams/Schedule/9?x=1&amp;activeEntityId=42">A</a><a href="/Teams/Schedule/9?activeEntityId=42">B</a><a href="/Teams/Schedule/8?activeEntityId=99">Wrong</a>', "42");
  assert.deepEqual(urls, ["https://www.arbiterlive.com/Teams/Schedule/9?activeEntityId=42"]);
  const found = new Map();
  scanLogos(`<table><tr data-gameid="1"><td><img src="https://assets.arbitersports.com/logos/organization/999">Our HS</td><td><img src="${asset}"><a>East High School</a></td></tr></table>`, new Set(["east hs", "east", ""]), found);
  assert.equal(found.get("east hs"), asset);
  assert.equal(found.has("east"), false);
  assert.equal(found.has(""), false);
});
test("normalization retains international names and cache keys distinguish schools", async t => {
  const { service } = await fixture(t);
  assert.equal(normalizeName("Éast High School"), "east hs");
  assert.notEqual(normalizeName("東京"), "");
  assert.notEqual(service.key("42", "East HS"), service.key("43", "East HS"));
  assert.notEqual(service.key("42", "East HS"), service.key("42", "East"));
});
test("repeated games and concurrent instances download once; cache survives restart", async t => {
  const f = await fixture(t);
  const [a, b] = await Promise.all([f.service.enrich(games(), config()), f.service.enrich(games(), config())]);
  assert.equal(f.downloads(), 1);
  assert.equal(f.discoveries(), 1);
  assert.equal(a.home.today[0].logoUrl, b.home.today[1].logoUrl);
  const restarted = new LogoService({ root: f.root, network: {} });
  restarted.discover = async () => { throw new Error("Should use disk cache"); };
  const data = await restarted.enrich(games(), config());
  assert.equal(data.home.today[0].logoUrl, a.home.today[0].logoUrl);
});
test("negative cache persists and expires", async t => {
  const f = await fixture(t);
  let now = Date.now();
  f.service.now = () => now;
  let attempts = 0;
  f.service.discover = async () => { attempts++; return new Map(); };
  await f.service.enrich(games(), config());
  await f.service.enrich(games(), config());
  assert.equal(attempts, 1);
  now += 86400001;
  await f.service.enrich(games(), config());
  assert.equal(attempts, 2);
});
test("manual overrides avoid all network and disk activity", async t => {
  const f = await fixture(t);
  const data = await f.service.enrich(games(), config({ overrides: [{ opponent: "East HS", image: "/modules/MMM-SchoolAthletics/east.svg" }], autoDiscover: false }));
  assert.equal(data.home.today[0].logoUrl, "/modules/MMM-SchoolAthletics/east.svg");
  assert.equal(f.downloads(), 0);
  assert.equal(f.discoveries(), 0);
  await assert.rejects(fs.access(f.service.dir));
});
test("bad downloaded bytes are not accepted as PNG", async t => {
  const f = await fixture(t);
  f.service.network.download = async () => ({ buffer: Buffer.from("<html>not a logo</html>") });
  await assert.rejects(f.service.download(asset));
});
test("corrupt cached files are repaired, stale logos are revalidated", async t => {
  const f = await fixture(t);
  let now = Date.now();
  f.service.now = () => now;
  const first = await f.service.enrich(games(), config());
  const file = path.join(f.service.dir, path.basename(first.home.today[0].logoUrl));
  await fs.writeFile(file, "corrupt");
  await f.service.enrich(games(), config());
  assert.equal((await sharp(await fs.readFile(file)).metadata()).format, "png");
  now += 2592000001;
  await f.service.enrich(games(), config());
  assert.equal(f.discoveries(), 3);
});
test("cache budget evicts old files and prunes managed orphans", async t => {
  const f = await fixture(t);
  await f.service.init();
  const now = Date.now();
  const old = "a".repeat(64) + ".png";
  const recent = "b".repeat(64) + ".png";
  const orphan = "c".repeat(64) + ".png";
  await Promise.all([old, recent, orphan].map(file => fs.writeFile(path.join(f.service.dir, file), Buffer.alloc(10))));
  f.service.entries.set("old", { file: old, checkedAt: now, usedAt: now - 10, expiresAt: now + 10000 });
  f.service.entries.set("new", { file: recent, checkedAt: now, usedAt: now, expiresAt: now + 10000 });
  f.service.budget = 15;
  assert.deepEqual([...await f.service.prune()], [recent]);
  assert.deepEqual(await fs.readdir(f.service.dir), [recent]);
  assert.equal(f.service.entries.has("old"), false);
});
test("expired logos fall back when refresh fails and negative-cache the miss", async t => {
  const f = await fixture(t);
  let now = Date.now();
  f.service.now = () => now;
  const first = await f.service.enrich(games(), config());
  f.service.discover = async () => new Map();
  now += 2592000001;
  const stale = await f.service.enrich(games(), config());
  assert.ok(first.home.today[0].logoUrl);
  assert.equal(stale.home.today[0].logoUrl, null);
  assert.ok(f.service.entries.get(f.service.key("42", "East HS")).retryAt > now);
  now += 604800001;
  const expired = await f.service.enrich(games(), config());
  assert.equal(expired.home.today[0].logoUrl, null);
});

test("valid local cache works with discovery disabled", async t => {
  const f = await fixture(t);
  const first = await f.service.enrich(games(), config());
  const cached = await f.service.enrich(games(), config({ autoDiscover: false }));
  assert.equal(cached.home.today[0].logoUrl, first.home.today[0].logoUrl);
  assert.equal(f.discoveries(), 1);
  assert.equal(f.downloads(), 1);
});
test("missing school ID skips automatic discovery but retains manual overrides", async t => {
  const f = await fixture(t);
  const c = normalize({ calendarUrl: "https://www.arbiterlive.com/calendar", logos: { overrides: [{ opponent: "EAST HS", image: "logos/example.png" }] } });
  const data = await f.service.enrich(games(), c);
  assert.equal(data.home.today[0].logoUrl, "/modules/MMM-SchoolAthletics/logos/example.png");
  assert.equal(f.discoveries(), 0);
  assert.equal(f.downloads(), 0);
});
test("zero-byte and invalid cached files are removed even without successful discovery", async t => {
  const f = await fixture(t);
  await f.service.init();
  for (const content of [Buffer.alloc(0), Buffer.from("not an image")]) {
    const file = "d".repeat(64) + ".png";
    await fs.writeFile(path.join(f.service.dir, file), content);
    assert.equal(await f.service.existing({ file }), null);
    await assert.rejects(fs.access(path.join(f.service.dir, file)));
  }
});

test("manual override wins over a warm automatic cache", async t => {
  const f = await fixture(t);
  await f.service.enrich(games(), config());
  const data = await f.service.enrich(games(), config({ overrides: [{ opponent: "EAST HS", image: "logos/manual.png" }] }));
  assert.equal(data.home.today[0].logoUrl, "/modules/MMM-SchoolAthletics/logos/manual.png");
  assert.equal(f.discoveries(), 1);
  assert.equal(f.downloads(), 1);
});
