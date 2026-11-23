"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_STATES = void 0;
exports.execJson = execJson;
exports.aggregateActivity = aggregateActivity;
exports.normalizeState = normalizeState;
exports.normalizeCommandSessions = normalizeCommandSessions;
exports.findRecentFiles = findRecentFiles;
exports.readJsonlTail = readJsonlTail;
exports.cleanString = cleanString;
exports.timestampString = timestampString;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const codex_1 = require("./codex");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
exports.VALID_STATES = new Set(["idle", "running", "waiting", "failed", "review"]);
async function execJson(command, args, options = {}) {
    const { stdout } = await execFileAsync(command, args, {
        windowsHide: true,
        timeout: options.timeout || 10_000,
        cwd: options.cwd,
    });
    return stdout.trim() ? JSON.parse(stdout) : [];
}
function aggregateActivity(source, sessions, now = new Date(), extra = {}) {
    const active = sessions.find((item) => item.state === "waiting") || sessions.find((item) => item.state === "running") || sessions[0] || null;
    const state = active?.state || "idle";
    return {
        source,
        state,
        petState: (0, codex_1.mapActivityToPetState)(state),
        active,
        sessions,
        updatedAt: now.toISOString(),
        ...extra,
    };
}
function normalizeState(value) {
    const state = typeof value === "string" ? value.toLowerCase() : "";
    if (exports.VALID_STATES.has(state))
        return state;
    if (["error", "errored", "fail", "failed", "crashed"].includes(state))
        return "failed";
    if (["busy", "active", "working", "running", "streaming"].includes(state))
        return "running";
    if (["blocked", "needs-input", "waiting", "paused"].includes(state))
        return "waiting";
    if (["complete", "completed", "done", "finished", "success", "succeeded", "inreview", "in_review"].includes(state))
        return "review";
    return "unknown";
}
function expireReportedState(state, timestamp, now, activeMs = 5 * 60_000) {
    if (state === "idle") return state;
    const age = +now - Date.parse(timestamp);
    const lifetime = state === "review" || state === "failed" ? 20 * 60_000 : activeMs;
    return Number.isFinite(age) && age >= -60_000 && age <= lifetime ? state : "stale";
}
exports.expireReportedState = expireReportedState;
function normalizeCommandSessions(output, source, now = new Date()) {
    const rows = Array.isArray(output) ? output : Array.isArray(output?.sessions) ? output.sessions : [];
    return rows
        .map((item, index) => normalizeCommandSession(item, index, source, now))
        .filter(Boolean)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 8);
}
function normalizeCommandSession(item, index, source, now) {
    if (!item || typeof item !== "object")
        return null;
    const updatedAt = cleanString(item.updatedAt) ||
        cleanString(item.updated_at) ||
        cleanString(item.modifiedAt) ||
        timestampString(item.updated) ||
        timestampString(item.created) ||
        timestampString(item.time_updated) ||
        timestampString(item.time_created) ||
        cleanString(item.time?.updated) ||
        cleanString(item.time?.created) ||
        now.toISOString();
    const title = cleanString(item.title) ||
        cleanString(item.name) ||
        cleanString(item.path) ||
        cleanString(item.project) ||
        `${source} session ${index + 1}`;
    const detail = cleanString(item.detail) ||
        cleanString(item.message) ||
        cleanString(item.summary) ||
        cleanString(item.model) ||
        `${source} session activity`;
    const state = expireReportedState(normalizeState(item.state || item.status), updatedAt, now);
    return {
        id: cleanString(item.id) || cleanString(item.sessionID) || cleanString(item.sessionId) || `${source}-${index}`,
        title,
        detail,
        state,
        petState: (0, codex_1.mapActivityToPetState)(state),
        updatedAt,
        latestEvent: detail,
    };
}
async function findRecentFiles(rootDir, predicate, limit = 8, maxDepth = Infinity) {
    const files = [];
    const stack = [{ dir: rootDir, depth: 0 }];
    while (stack.length > 0) {
        const { dir, depth } = stack.pop();
        let entries = [];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && depth < maxDepth)
                stack.push({ dir: fullPath, depth: depth + 1 });
            else if (entry.isFile() && predicate(fullPath, entry.name, dir)) {
                try {
                    const stat = await fs.stat(fullPath);
                    files.push({ filePath: fullPath, stat });
                }
                catch {
                    // Ignore races from active session writers.
                }
            }
        }
    }
    return files.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs).slice(0, limit);
}
async function readJsonlTail(filePath, limit = 120) {
    let file;
    try {
        file = await fs.open(filePath, "r");
        const { size } = await file.stat();
        const bytes = Math.min(size, 256 * 1024);
        const position = size - bytes;
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await file.read(buffer, 0, bytes, position);
        const lines = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/);
        if (position > 0) lines.shift();
        return lines.filter(Boolean).slice(-limit).map(parseJsonLine).filter(Boolean);
    } catch {
        return [];
    } finally {
        await file?.close();
    }
}
function parseJsonLine(line) {
    try {
        return JSON.parse(line);
    }
    catch {
        return null;
    }
}
function cleanString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
function timestampString(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp))
        return null;
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
