"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const { Network, checkUrl } = require("../lib/network");
const { version } = require("../package.json");
function requestFixture(responses, seen = []) {
  return (url, options, callback) => {
    seen.push({ url: url.href, options });
    const request = new EventEmitter();
    queueMicrotask(() => {
      const data = responses.shift();
      const response = Readable.from(data.chunks || [Buffer.from(data.text || "")]);
      response.statusCode = data.status || 200;
      response.headers = data.headers || {};
      callback(response);
    });
    return request;
  };
}
test("redirects are validated before any second request", async () => {
  for (const location of ["http://www.arbiterlive.com/x", "https://127.0.0.1/x", "https://evil.test/x"]) {
    const seen = [];
    const network = new Network({ request: requestFixture([{ status: 302, headers: { location } }], seen) });
    await assert.rejects(network.download("https://www.arbiterlive.com/x"));
    assert.equal(seen.length, 1);
  }
  assert.throws(() => checkUrl("https://assets.arbitersports.com/logos/organization/1/../../x", "logo"));
});
test("streaming size limit applies even without Content-Length", async () => {
  const network = new Network({ request: requestFixture([{ chunks: [Buffer.alloc(4), Buffer.alloc(4)] }]) });
  await assert.rejects(network.download("https://www.arbiterlive.com/x", { maxBytes: 6 }), /size limit/);
});
test("shared requests, cache TTL, and conditional 304 reuse", async () => {
  const seen = [];
  let now = 100000;
  const network = new Network({ now: () => now, request: requestFixture([
    { text: "calendar", headers: { etag: '"v1"' } }, { status: 304 }
  ], seen) });
  const url = "https://www.arbiterlive.com/calendar";
  const [a, b] = await Promise.all([network.text(url), network.text(url)]);
  assert.deepEqual(a, b);
  assert.equal(seen.length, 1);
  await network.text(url);
  assert.equal(seen.length, 1);
  now += 900001;
  const revalidated = await network.text(url);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].options.headers["If-None-Match"], '"v1"');
  assert.equal(revalidated.text, "calendar");
  assert.equal(revalidated.checkedAt, now);
});
test("failures back off and recover instead of causing repeated requests", async () => {
  const seen = [];
  let now = 100000;
  const network = new Network({ now: () => now, request: requestFixture([{ status: 503 }, { text: "ok" }], seen) });
  const url = "https://www.arbiterlive.com/calendar";
  await assert.rejects(network.text(url), /503/);
  await assert.rejects(network.text(url), /cooling down/);
  assert.equal(seen.length, 1);
  now += 60001;
  assert.equal((await network.text(url)).text, "ok");
});
test("at most four downloads hold network slots", async () => {
  const network = new Network();
  let active = 0;
  let maximum = 0;
  await Promise.all(Array.from({ length: 12 }, () => network.slot(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
  })));
  assert.equal(maximum, 4);
  assert.equal(network.active, 0);
});
test("DNS guard rejects private, loopback, link-local and mapped local addresses", () => {
  const { isPublicAddress } = require("../lib/network");
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.1.1", "192.168.1.1", "169.254.169.254", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "100.64.0.1"]) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("default user-agent includes current package version", async () => {
  const seen = [];
  const network = new Network({ request: requestFixture([{ text: "ok" }], seen) });
  await network.download("https://www.arbiterlive.com/test");
  assert.equal(
    seen[0].options.headers["User-Agent"],
    `MagicMirror-SchoolAthletics/${version}`
  );
});
