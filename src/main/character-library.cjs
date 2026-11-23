"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { readPets } = require("./pet-store");
const { readWebpInfo } = require("./image-info");

const bundled = path.join(__dirname, "../../characters");
function libraryRoot() {
  return process.env.AGENTWHISKER_LIBRARY || process.env.PINGFOLK_LIBRARY || process.env.PIPGLANCE_LIBRARY || process.env.CODE_WISP_LIBRARY || path.join(require("electron").app.getPath("appData"), "AgentWhisker", "library");
}

async function listCharacters(root = libraryRoot()) {
  const included = await readPets(bundled);
  const installed = (await readPets(root)).filter(pet => pet.id !== "kitsu");
  for (const pet of installed) {
    const manifest = JSON.parse(await fs.readFile(path.join(pet.folder, "pet.json"), "utf8"));
    pet.forehead = manifest.forehead;
  }
  return [...included, ...installed];
}

async function importCharacter(filename, root = libraryRoot()) {
  if ((await fs.stat(filename)).size > 32 * 1024 * 1024) throw Error("Pack exceeds size limit");
  const pack = JSON.parse(await fs.readFile(filename, "utf8"));
  if (!["agentwhisker-character/1", "pingfolk-character/1", "pipglance-character/1", "code-wisp-character/1"].includes(pack.format) || typeof pack.id !== "string" ||
      !/^[a-z][a-z0-9-]{0,39}$/.test(pack.id) || /^(kitsu|con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(pack.id) ||
      typeof pack.displayName !== "string" || !pack.displayName.trim() || pack.displayName.length > 80 ||
      typeof pack.image !== "string" || typeof pack.license !== "string" || !pack.license.trim())
    throw Error("Invalid character package");
  const bytes = Buffer.from(pack.image, "base64");
  const size = readWebpInfo(bytes);
  if (size?.width !== 1536 || size.height !== 1872 || createHash("sha256").update(bytes).digest("hex") !== pack.sha256)
    throw Error("Invalid character atlas");
  const forehead = {};
  for (const state of ["idle","running","waiting","failed"]) {
    const v = pack.forehead?.[state];
    if (Array.isArray(v) && v.length === 2 && v.every(Number.isInteger) && v[0]>=0 && v[0]<192 && v[1]>=0 && v[1]<208)
      forehead[state] = v;
  }
  const manifest = {id:pack.id, displayName:pack.displayName, description:String(pack.description || "").slice(0,500),
    spritesheetPath:"spritesheet.webp", forehead};
  const pets = path.join(root,"pets"), dest = path.join(pets,pack.id);
  await fs.mkdir(pets,{recursive:true});
  const temp = await fs.mkdtemp(path.join(root,".install-"));
  try {
    await fs.writeFile(path.join(temp,"pet.json"), JSON.stringify(manifest,null,2));
    await fs.writeFile(path.join(temp,"spritesheet.webp"),bytes);
    await fs.writeFile(path.join(temp,"ARTWORK.txt"),pack.license);
    try { await fs.rename(temp,dest); }
    catch (error) {
      if (!["EEXIST","ENOTEMPTY","EPERM","EACCES"].includes(error.code)) throw error;
      const existing = await fs.readFile(path.join(dest,"spritesheet.webp"));
      if (!existing.equals(bytes) ||
          await fs.readFile(path.join(dest,"pet.json"),"utf8") !== JSON.stringify(manifest,null,2) ||
          await fs.readFile(path.join(dest,"ARTWORK.txt"),"utf8") !== pack.license) throw Error("Different pack already installed");
    }
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
  return pack.id;
}
module.exports = { listCharacters, importCharacter };
