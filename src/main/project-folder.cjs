"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

async function projectFolder(session) {
    if (!["running", "waiting", "failed"].includes(session.state)) return null;
    let folder = session.directory;
    if (typeof folder !== "string" || !path.isAbsolute(folder)) return null;
    if (process.platform === "win32") {
        if (folder.startsWith("\\\\?\\")) folder = folder.slice(4);
        if (!/^[A-Za-z]:[\\/]/.test(folder)) return null;
    }
    try {
        const target = await fs.realpath(folder);
        if (process.platform === "win32" && !/^[A-Za-z]:[\\/]/.test(target)) return null;
        return (await fs.stat(target)).isDirectory() ? target : null;
    } catch { return null; }
}

module.exports = {projectFolder};
