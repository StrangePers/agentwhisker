"use strict";
const fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname,".."), pkg = require("../package.json");
const cached = path.join(root,".cache",`electron-${pkg.devDependencies.electron}`);
const shell = process.argv[2] ? path.resolve(process.argv[2]) :
  fs.existsSync(path.join(cached,"electron.exe")) ? cached : path.dirname(require("electron"));
if (fs.readFileSync(path.join(shell,"version"),"utf8").trim().replace(/^v/,"") !== pkg.devDependencies.electron)
  throw Error("Electron version does not match package.json");
const dist = process.env.AGENTWHISKER_DIST_DIR
  ? path.resolve(process.env.AGENTWHISKER_DIST_DIR)
  : path.join(root,"dist");
fs.mkdirSync(dist,{recursive:true});
const target = path.join(dist,"AgentWhisker-win32-x64");
const stage = fs.mkdtempSync(path.join(dist,".stage-"));
const app = path.join(stage,"resources","app");
try {
  fs.mkdirSync(app,{recursive:true});
  const runtimeFiles = fs.readdirSync(shell).filter(name => !["electron.exe","version","resources"].includes(name));
  for (const name of runtimeFiles)
    fs.cpSync(path.join(shell,name),path.join(stage,name),{recursive:true});
  fs.copyFileSync(path.join(shell,"electron.exe"),path.join(stage,"AgentWhisker.exe"));
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", path.join(__dirname,"set-win-icon.ps1"), path.join(stage,"AgentWhisker.exe"),
    path.join(root,"src","assets","agentwhisker.ico")], { stdio:"inherit" });
  for (const name of ["src","characters","package.json","LICENSE","ARTWORK.md","NOTICE.md"])
    fs.cpSync(path.join(root,name),path.join(app,name),{recursive:true});
  const old = stage+"-previous";
  if (fs.existsSync(target)) {
    if (JSON.parse(fs.readFileSync(path.join(target,"resources/app/package.json"))).name !== pkg.name) throw Error("Unexpected output directory");
    fs.renameSync(target,old);
  }
  try { fs.renameSync(stage,target); }
  catch (error) { if (fs.existsSync(old)) fs.renameSync(old,target); throw error; }
  if (fs.existsSync(old)) fs.rmSync(old,{recursive:true});
  console.log(path.join(target,"AgentWhisker.exe"));
} finally { fs.rmSync(stage,{recursive:true,force:true}); }
