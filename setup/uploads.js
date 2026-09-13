"use strict";
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const MAX_BYTES = 8 * 1024 * 1024;
function safeName(filename) {
  if (typeof filename !== "string" || !filename || filename.length > 200 || /[\\/\x00-\x1f:]/.test(filename) || filename.includes("..") || path.isAbsolute(filename)) throw new Error("Invalid image filename.");
  const extension = path.extname(filename).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new Error("Choose a PNG, JPEG, or WebP image.");
  const stem = path.basename(filename, path.extname(filename)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "image";
  return { stem, extension };
}
async function saveImage(root, filename, bytes) {
  const { stem, extension } = safeName(filename);
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) throw new Error("Choose an image no larger than 8 MiB.");
  const expected = extension === ".jpg" || extension === ".jpeg" ? "jpeg" : extension.slice(1);
  const image = sharp(bytes, { limitInputPixels: 24000000, failOn: "warning", animated: true });
  const metadata = await image.metadata();
  if (metadata.format !== expected || (metadata.pages || 1) !== 1) throw new Error("Image bytes must match the filename; animated images are unsupported.");
  // Decode and re-encode to reject malformed images and remove metadata/trailing payloads.
  const clean = await image.rotate().toFormat(expected).toBuffer();
  if (clean.length > MAX_BYTES) throw new Error("Decoded image exceeds the 8 MiB limit. Optimize it first.");
  let directory = fs.realpathSync(root);
  for (const part of ["images", "uploads"]) {
    directory = path.join(directory, part);
    try { fs.mkdirSync(directory); } catch (error) { if (error.code !== "EEXIST") throw error; }
    if (fs.lstatSync(directory).isSymbolicLink() || !fs.lstatSync(directory).isDirectory() || fs.realpathSync(directory) !== directory) throw new Error("Upload directory must not contain symlinks.");
  }
  for (let n = 1; n <= 10000; n++) {
    const name = `${stem}${n === 1 ? "" : `-${n}`}${extension}`;
    const destination = path.join(directory, name);
    let fd;
    try { fd = fs.openSync(destination, "wx", 0o600); }
    catch (error) { if (error.code === "EEXIST") continue; throw error; }
    try { fs.writeFileSync(fd, clean); }
    catch (error) { fs.closeSync(fd); fs.unlinkSync(destination); throw error; }
    fs.closeSync(fd);
    return { path: `images/uploads/${name}` };
  }
  throw new Error("Too many duplicate filenames. Rename the image.");
}
module.exports = { MAX_BYTES, safeName, saveImage };
