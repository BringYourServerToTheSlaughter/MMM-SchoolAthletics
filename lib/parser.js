"use strict";
const { Worker } = require("node:worker_threads");
const path = require("node:path");
// Parsing and recurrence expansion cannot block the MagicMirror helper indefinitely.
function parseInWorker(text, config, now = Date.now()) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "calendar-worker.js"), {
      workerData: { text, config, now }, resourceLimits: { maxOldGenerationSizeMb: 64 }
    });
    const timer = setTimeout(() => { reject(new Error("Calendar parsing exceeded its time limit.")); void worker.terminate(); }, 5000);
    worker.once("message", result => { clearTimeout(timer); result.error ? reject(new Error(result.error)) : resolve(result.data); });
    worker.once("error", error => { clearTimeout(timer); reject(error); });
    worker.once("exit", code => { clearTimeout(timer); if (code !== 0) reject(new Error("Calendar parser stopped unexpectedly.")); });
  });
}
module.exports = { parseInWorker };
