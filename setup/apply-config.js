"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { parse } = require("acorn");
const { generate, coordinates } = require("./generator");
const digest = text => createHash("sha256").update(text).digest("hex");
function discover(root, explicit) {
  const automatic = path.basename(path.dirname(root)) === "modules";
  if (automatic) return path.resolve(root, "../../config/config.js");
  if (!explicit) throw new Error("Cannot detect MagicMirror. Restart with --config /absolute/path/to/config.js.");
  if (!path.isAbsolute(explicit)) throw new Error("Config path must be absolute.");
  return explicit;
}
function readTarget(target) {
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Target must be a regular config file, not a symlink.");
  const source = fs.readFileSync(target, "utf8");
  return { source, version: digest(source), mode: stat.mode & 0o777 };
}
function transform(source, state, report = {}) {
  const generated = generate(state);
  if (!generated.output) throw new Error("Invalid generated configuration: " + Object.values(generated.errors).join(" "));
  const ast = parse(source, { ecmaVersion: "latest" });
  const declarations = ast.body.filter(n => n.type === "VariableDeclaration").flatMap(n => n.declarations).filter(n => n.id.name === "config");
  if (declarations.length !== 1 || declarations[0].init?.type !== "ObjectExpression") throw new Error("Unsupported config: expected a literal var/let/const config object. Use Copy configuration.");
  function inspect(node, parent) {
    if (!node || typeof node !== "object") return;
    if (node.type === "Identifier" && node.name === "config") {
      const declaration = parent?.type === "VariableDeclarator" && parent.id === node;
      const typeCheck = parent?.type === "UnaryExpression" && parent.operator === "typeof";
      const exportValue = parent?.type === "AssignmentExpression" && parent.operator === "=" && parent.right === node && parent.left?.type === "MemberExpression" && !parent.left.computed && parent.left.object.name === "module" && parent.left.property.name === "exports";
      const key = parent?.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand;
      if (!declaration && !typeCheck && !exportValue && !key) throw new Error("Dynamic config references are unsupported. Use Copy configuration.");
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => inspect(child, node));
      else if (value && typeof value === "object") inspect(value, node);
    }
  }
  inspect(ast);
  const object = declarations[0].init;
  const name = p => p.computed ? undefined : p.key?.name || p.key?.value;
  if (object.properties.some(p => p.type !== "Property" || p.computed || p.kind !== "init")) throw new Error("Dynamic config properties are unsupported.");
  const properties = object.properties.filter(p => name(p) === "modules");
  if (properties.length !== 1 || properties[0].value.type !== "ArrayExpression") throw new Error("Expected one literal modules array.");
  const array = properties[0].value;
  const entry = JSON.stringify(generated.entry, null, 2);
  let result;
  if (state.outputMode === "clean") {
    // Inspect literal settings only; preserve the selected widget's source verbatim
    // except for its display position. Never evaluate provider/location expressions.
    const props = node => node?.type === "ObjectExpression" && node.properties.every(p => p.type === "Property" && !p.computed && p.kind === "init" && !p.method && !p.shorthand) && new Set(node.properties.map(name)).size === node.properties.length ? node.properties : [];
    const value = (node, key) => props(node).find(p => name(p) === key)?.value;
    const literal = (node, key) => value(node, key)?.type === "Literal" ? value(node, key).value : undefined;
    const nonempty = v => typeof v === "string" && v.trim().length > 0;
    const candidates = array.elements.filter(item => {
      const settings = value(item, "config");
      const latitude = literal(settings, "lat"), longitude = literal(settings, "lon");
      const location = nonempty(literal(settings, "location")) || nonempty(literal(settings, "locationID")) || typeof literal(settings, "locationID") === "number" || (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180);
      return literal(item, "module") === "weather" && (!value(item, "disabled") || literal(item, "disabled") === false) && literal(settings, "type") === "current" && nonempty(literal(settings, "weatherProvider")) && location;
    });
    const weather = candidates.find(item => literal(item, "position") === "top_right") || candidates[0];
    const modules = [JSON.stringify({ module: "clock", position: "top_left" }, null, 2)];
    if (weather) {
      const position = value(weather, "position");
      const preserved = position ? source.slice(weather.start, position.start) + '"top_right"' + source.slice(position.end, weather.end) : source.slice(weather.start, weather.start + 1) + 'position: "top_right",' + source.slice(weather.start + 1, weather.end);
      modules.push(preserved);
    }
    const location = coordinates(state);
    if (!weather && location) modules.push(JSON.stringify({ module: "weather", position: "top_right", config: { weatherProvider: "openmeteo", type: "current", ...location } }, null, 2));
    report.weather = !weather && location ? "Current Open-Meteo weather configured from supplied coordinates." : weather ? "Existing current-weather widget preserved at top_right." : "No safely identifiable current-weather widget found; weather omitted. Configure your provider/location separately.";
    modules.push(entry);
    result = source.slice(0, array.start) + "[\n" + modules.join(",\n") + "\n]" + source.slice(array.end);
  } else {
    const matches = [];
    for (const item of array.elements) {
      if (!item || item.type !== "ObjectExpression" || item.properties.some(p => p.type !== "Property" || p.computed || p.kind !== "init")) throw new Error("Dynamic module entries are unsupported. Use Copy configuration.");
      const names = item.properties.filter(p => name(p) === "module");
      if (names.length !== 1 || names[0].value.type !== "Literal" || typeof names[0].value.value !== "string") throw new Error("Each module must have a literal module name.");
      if (names[0].value.value === "MMM-SchoolAthletics") matches.push(item);
    }
    if (matches.length > 1) throw new Error("Multiple athletics instances found. Use Copy configuration to choose one.");
    const old = matches[0];
    result = old ? source.slice(0, old.start) + entry + source.slice(old.end) : source.slice(0, array.start + 1) + "\n" + entry + (array.elements.length ? "," : "") + source.slice(array.start + 1);
  }
  parse(result, { ecmaVersion: "latest" });
  return result;
}
function apply(target, state, version, io = fs) {
  const original = readTarget(target);
  if (original.version !== version) throw new Error("Config changed. Reload the setup page before applying.");
  const report = {};
  const updated = transform(original.source, state, report);
  const suffix = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID();
  const backup = `${target}.backup-${suffix}`;
  const temporary = `${target}.tmp-${suffix}`;
  try {
    io.writeFileSync(backup, original.source, { flag: "wx", mode: 0o600 });
    io.writeFileSync(temporary, updated, { flag: "wx", mode: original.mode });
    if (readTarget(target).version !== version) throw new Error("Config changed during apply; original left untouched.");
    io.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { backup, version: digest(updated), ...report };
}
module.exports = { discover, readTarget, transform, apply };
