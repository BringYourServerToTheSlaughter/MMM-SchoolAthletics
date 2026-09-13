"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const { parseSchedule } = require("./calendar");
try { parentPort.postMessage({ data: parseSchedule(workerData.text, workerData.config, workerData.now) }); }
catch (error) { parentPort.postMessage({ error: error.message }); }
