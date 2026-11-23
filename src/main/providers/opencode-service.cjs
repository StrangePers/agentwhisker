"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function connectOpenCodeService(file = path.join(process.env.XDG_STATE_HOME ||
    path.join(os.homedir(), ".local", "state"), "opencode", "service.json")) {
    const service = JSON.parse(await fs.readFile(file, "utf8"));
    const url = new URL(service.url);
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) ||
        !url.port || url.username || url.password || typeof service.password !== "string") {
        throw new Error("Invalid local OpenCode service");
    }
    const headers = {Authorization:"Basic " + Buffer.from("opencode:" + service.password).toString("base64")};
    return async (endpoint, timeout = 1500) => {
        const target = new URL(endpoint, url);
        if (target.origin !== url.origin) throw new Error("Invalid OpenCode route");
        return fetch(target, {headers, redirect:"error", signal:AbortSignal.timeout(timeout)});
    };
}

module.exports = {connectOpenCodeService};
