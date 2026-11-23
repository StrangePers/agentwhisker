"use strict";

const { spawn } = require("node:child_process");
const { accessSync, constants } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createInterface } = require("node:readline");
const { version } = require("../../../package.json");
const { createLimitsSource } = require("./limits-source.cjs");

function findCodexExecutable() {
    const windows = process.platform === "win32";
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    const vendor = path.join(`codex-win32-${process.arch}`, "vendor", `${arch}-pc-windows-msvc`, "bin", "codex.exe");
    const directories = [...(process.env.PATH || "").split(path.delimiter),
        ...(windows && process.env.APPDATA ? [path.join(process.env.APPDATA, "npm")] : []),
        ...(process.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin"] : []),
        path.join(os.homedir(), ".local", "bin")];
    for (const dir of directories.filter(directory => path.isAbsolute(directory))) {
        const candidates = windows ? [path.join(dir, "codex.exe"),
            path.join(dir, "node_modules", "@openai", "codex", "node_modules", "@openai", vendor),
            path.join(dir, "node_modules", "@openai", vendor)] : [path.join(dir, "codex")];
        for (const candidate of candidates) {
            try { accessSync(candidate, constants.X_OK); return candidate; }
            catch { /* Continue looking in PATH order. */ }
        }
    }
    return null;
}

function normalizeQuota(result, now = new Date()) {
    const buckets = Object.entries(result?.rateLimitsByLimitId || {});
    if (!buckets.length && result?.rateLimits) buckets.push(["codex", result.rateLimits]);
    return buckets.slice(0,12).flatMap(([bucketId,bucket]) => ["primary", "secondary"].flatMap(period => {
        const window = bucket?.[period];
        if (!Number.isFinite(window?.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100) return [];
        const reset = Number.isFinite(window.resetsAt) ? new Date(window.resetsAt * 1000) : null;
        const bucketName = typeof bucket.limitName === "string" ? bucket.limitName.trim().slice(0,60) : "";
        return [{ id:`${bucketId}:${period}`, kind:period, bucket_name:bucketName,
            window_minutes:window.windowDurationMins, remaining_percent:100-window.usedPercent,
            resets_at:reset && Number.isFinite(+reset) ? reset.toISOString() : null,
            status:reset && +reset <= +now ? "expired" : "known" }];
    }));
}

function loadCodexQuota(executable, codexHome) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, ["app-server", "--listen", "stdio://"], {
            env:{...process.env, CODEX_HOME:codexHome}, windowsHide:true, stdio:["pipe","pipe","ignore"],
        });
        const lines = createInterface({input:child.stdout});
        let finished = false;
        const finish = (error, result) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            lines.close();
            child.stdin.destroy();
            if (child.exitCode === null) child.kill();
            if (error) reject(error);
            else resolve(result);
        };
        const fail = () => finish(new Error("Codex quota unavailable"));
        const timeout = setTimeout(fail, 12_000);
        const send = message => child.stdin.write(JSON.stringify(message) + "\n");
        let expected = 1;
        child.once("error", fail);
        child.stdin.on("error", fail);
        lines.once("close", fail);
        lines.on("line", line => {
            if (line.length > 256 * 1024) return fail();
            let response;
            try { response = JSON.parse(line); } catch { return; }
            if (response?.id !== expected) return;
            if (response.error || !response.result) return fail();
            if (expected === 1) {
                expected = 2;
                send({method:"initialized"});
                send({id:2,method:"account/read",params:{refreshToken:false}});
            } else if (expected === 2) {
                if (response.result.account?.type !== "chatgpt") return finish(null, null);
                expected = 3;
                send({id:3,method:"account/rateLimits/read",params:{}});
            } else {
                finish(null, normalizeQuota(response.result));
            }
        });
        send({id:1,method:"initialize",params:{clientInfo:{name:"AgentWhisker",version}}});
    });
}

function createCodexLimits(executable, codexHome, load = loadCodexQuota) {
    return createLimitsSource(async () => {
        const windows = await load(executable, codexHome);
        return {providers:windows?.length ? [{id:"codex",name:"Codex",connected:true,status:"known",
            observed_at:new Date().toISOString(),windows}] : [], unavailable:windows === null ? "codex_account" : null};
    });
}

module.exports = {findCodexExecutable, loadCodexQuota, normalizeQuota, createCodexLimits};
