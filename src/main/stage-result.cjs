"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_BYTES = 512 * 1024;

async function readStageResult(statusFile, id) {
    if (!path.isAbsolute(statusFile) || typeof id !== "string" || !/^rs-[0-9a-f]{32}$/.test(id)) {
        throw new Error("Invalid RoleShuttle stage");
    }
    const root = await fs.realpath(path.dirname(statusFile));
    const target = path.join(root, "stages", id + ".json");
    if (path.relative(target, await fs.realpath(target)) !== "") {
        throw new Error("Unexpected RoleShuttle result path");
    }
    const file = await fs.open(target, "r");
    try {
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        const {bytesRead} = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > MAX_BYTES) throw new Error("RoleShuttle result is too large");
        const entry = JSON.parse(buffer.toString("utf8", 0, bytesRead));
        if (entry?.id !== id || !["waiting", "review", "failed"].includes(entry.state) || !entry.receipt) {
            throw new Error("RoleShuttle result is unavailable");
        }
        return typeof entry.receipt.result === "string" ? entry.receipt.result : JSON.stringify(entry.receipt, null, 2);
    } finally {
        await file.close();
    }
}

function resultPage(title, result) {
    const escape = value => value.replace(/[&<>]/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;"}[char]));
    return "data:text/html;charset=utf-8," + encodeURIComponent(
        '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
        "<title>" + escape(title) + "</title><style>body{font:16px system-ui;margin:24px;color-scheme:light dark}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>" +
        "<h1>" + escape(title) + "</h1><pre>" + escape(result) + "</pre>");
}

module.exports = {readStageResult, resultPage};
