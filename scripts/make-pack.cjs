"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const [folder, licenseFile, outFile] = process.argv.slice(2);
if (!outFile) throw Error("Usage: node scripts/make-pack.cjs <character-folder> <artwork-license> <output.whiskerpack>");
const manifest = JSON.parse(fs.readFileSync(path.join(folder,"pet.json"),"utf8"));
const atlas = fs.readFileSync(path.join(folder,"spritesheet.webp"));
const size = require("../src/main/image-info").readWebpInfo(atlas);
if (size?.width !== 1536 || size?.height !== 1872) throw Error("Expected a 1536x1872 WebP atlas");
const pack = {format:"agentwhisker-character/1",id:manifest.id,displayName:manifest.displayName,
  description:manifest.description,forehead:manifest.forehead,license:fs.readFileSync(licenseFile,"utf8"),
  sha256:crypto.createHash("sha256").update(atlas).digest("hex"),image:atlas.toString("base64")};
fs.writeFileSync(outFile,JSON.stringify(pack),{flag:"wx"});
