"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

async function requestJson(url, headers, timeout) {
    const signal = AbortSignal.timeout(timeout);
    return new Promise((resolve, reject) => {
        const request = http.get(url, {headers, signal}, async response => {
            try {
                const status = response.statusCode;
                if (status >= 300 && status < 400 && response.headers.location) {
                    response.destroy();
                    throw new Error("Unexpected OpenCode redirect");
                }
                const ok = status >= 200 && status < 300;
                if (!ok) {
                    response.destroy();
                    resolve({status, ok});
                    return;
                }
                const chunks = [];
                let bytes = 0;
                for await (const chunk of response) {
                    bytes += chunk.length;
                    if (bytes > MAX_RESPONSE_BYTES) throw new Error("OpenCode response too large");
                    chunks.push(chunk);
                }
                const body = Buffer.concat(chunks, bytes).toString("utf8");
                resolve({status, ok, json: async () => JSON.parse(body)});
            } catch (error) { reject(error); }
        });
        request.on("error", reject);
    });
}

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
        return requestJson(target, headers, timeout);
    };
}

module.exports = {connectOpenCodeService};
