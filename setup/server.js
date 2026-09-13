"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { discover, readTarget, apply } = require("./apply-config");
const { MAX_BYTES, saveImage } = require("./uploads");
function createServer(root, target) {
  let uploads = 0;
  return http.createServer(async (req, res) => {
    const authority = `127.0.0.1:${req.socket.localPort}`;
    const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(JSON.stringify(value)); };
    if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== `http://${authority}`)) return json(403, { error: "Only same-origin localhost requests are allowed." });
    try {
      if (req.url === "/api/uploads" && req.method === "GET") return json(200, { uploads: true, maxBytes: MAX_BYTES });
      if (req.url === "/api/upload" && req.method === "POST") {
        if (req.headers.origin !== `http://${authority}` || req.headers["x-setup-upload"] !== "1" || !["image/png", "image/jpeg", "image/webp"].includes(req.headers["content-type"])) return json(403, { error: "Use the local setup page to upload PNG, JPEG, or WebP images." });
        if (uploads >= 2) throw new Error("Another image is being processed. Try again shortly.");
        uploads++;
        try {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk); size += bytes.length;
          if (size > MAX_BYTES) throw new Error("Choose an image no larger than 8 MiB.");
          chunks.push(bytes);
        }
        return json(200, await saveImage(root, decodeURIComponent(req.headers["x-image-name"] || ""), Buffer.concat(chunks)));
        } finally { uploads--; }
      }
      if (req.url === "/api/target" && req.method === "GET") return json(200, { target, version: readTarget(target).version });
      if (req.url === "/api/apply" && req.method === "POST") {
        if (req.headers.origin !== `http://${authority}` || req.headers["x-setup-apply"] !== "1" || req.headers["content-type"] !== "application/json") return json(403, { error: "Use the local setup page to apply." });
        let body = "";
        for await (const chunk of req) { body += chunk; if (body.length > 32768) throw new Error("Request too large."); }
        const { state, version } = JSON.parse(body);
        return json(200, apply(target, state, version));
      }
      if (req.method !== "GET") return json(405, { error: "Method not allowed." });
      let relative = decodeURIComponent(req.url.split("?")[0]);
      if (relative === "/" || relative === "/setup/") relative = "/setup/index.html";
      const file = path.resolve(root, "." + relative);
      const real = fs.realpathSync(file);
      if (!real.startsWith(fs.realpathSync(root) + path.sep)) throw new Error("Asset unavailable.");
      const ext = path.extname(file);
      const allowed = ["/setup/index.html", "/setup/setup.js", "/setup/setup.css", "/setup/generator.js", "/setup/apply-ui.js", "/setup/location.js", "/setup/upload-ui.js", "/setup/preview.html", "/setup/preview.css", "/setup/preview-model.js", "/setup/preview-controller.js", "/setup/preview-frame.js", "/shared/config.js"];
      if (!allowed.includes(relative) && !/\.(png|jpe?g|webp|gif|svg)$/i.test(relative)) throw new Error("Asset unavailable.");
      let body = fs.readFileSync(real);
      if (relative === "/setup/index.html") body = body.toString().replace("connect-src 'none'", "connect-src 'self'");
      res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" })[ext], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN" });
      res.end(body);
    } catch (error) { json(400, { error: error.message }); }
  });
}
if (require.main === module) {
  try {
    const root = path.resolve(__dirname, "..");
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== "--config")) throw new Error("Usage: node setup/server.js [--config /absolute/path/to/config.js]");
    const target = discover(root, args[1]);
    readTarget(target);
    const server = createServer(root, target);
    server.on("error", error => { console.error(error.message); process.exitCode = 1; });
    server.listen(8081, "127.0.0.1", () => console.log(`Open http://127.0.0.1:8081/setup/\nTarget: ${target}`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createServer };
