"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {readProviderActivity} = require("./index");

const commands = {codex:"codex", "claude-code":"claude", opencode:"opencode", "qwen-code":"qwen"};
async function commandExists(name) {
    const dirs = (process.env.PATH || "").split(path.delimiter).filter(dir => path.isAbsolute(dir));
    const suffixes = process.platform === "win32" ? [".exe", ".cmd", ".bat"] : [""];
    for (const dir of dirs) {
        for (const suffix of suffixes) {
            const file = path.join(dir, name + suffix);
            try {
                if (!(await fs.stat(file)).isFile()) continue;
                await fs.access(file, fs.constants.X_OK);
                return true;
            } catch { /* Try the next PATH entry. */ }
        }
    }
    return false;
}

async function discoverSources(codexHome, read = readProviderActivity, installed = commandExists) {
    const matches = await Promise.all(Object.entries(commands).map(async ([provider, command]) => {
        if (await installed(command)) return provider;
        const activity = await read({provider, codexHome}).catch(() => null);
        return activity && !activity.error && (activity.sessions.length || provider === "opencode")
            ? provider : null;
    }));
    return matches.filter(Boolean);
}

module.exports = {discoverSources};
