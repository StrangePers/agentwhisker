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
exports.readClaudeCodeActivity = readClaudeCodeActivity;
exports.normalizeClaudeSession = normalizeClaudeSession;
exports.normalizeClaudeState = normalizeClaudeState;
const path = __importStar(require("node:path"));
const codex_1 = require("./codex");
const shared_1 = require("./shared");
async function readClaudeCodeActivity(options = {}) {
    const now = options.now || new Date();
    const claudeHome = options.claudeHome || path.join(process.env.USERPROFILE || process.env.HOME || "", ".claude");
    const projectsRoot = options.projectsRoot || path.join(claudeHome, "projects");
    try {
        const files = await (0, shared_1.findRecentFiles)(projectsRoot, (_fullPath, name) => name.endsWith(".jsonl"), 8);
        const sessions = [];
        for (const file of files) {
            const records = await (0, shared_1.readJsonlTail)(file.filePath);
            sessions.push(normalizeClaudeSession(file, records, now));
        }
        return (0, shared_1.aggregateActivity)("claude-code", sessions, now, { claudeHome });
    }
    catch (error) {
        return (0, shared_1.aggregateActivity)("claude-code", [], now, { claudeHome, error: error instanceof Error ? error.message : String(error) });
    }
}
function normalizeClaudeSession(file, records, now) {
    const latest = findLatestRecord(records);
    const sessionId = (0, shared_1.cleanString)(latest?.sessionId) || path.basename(file.filePath, ".jsonl");
    const cwd = (0, shared_1.cleanString)(latest?.cwd);
    const title = cwd ? path.basename(cwd) || cwd : path.basename(path.dirname(file.filePath));
    const updatedAt = (0, shared_1.cleanString)(latest?.timestamp) || new Date(file.stat.mtimeMs).toISOString();
    const recentRecords = records.slice(-12);
    const error = recentRecords.some((record) => record.error || record.isApiErrorMessage);
    const state = error ? "failed" : normalizeClaudeState(latest, updatedAt, now);
    const latestEvent = summarizeClaudeRecord(latest);
    return {
        id: sessionId,
        title: title || "Claude Code session",
        detail: latestEvent,
        state,
        petState: (0, codex_1.mapActivityToPetState)(state),
        updatedAt,
        sessionPath: file.filePath,
        latestEvent,
    };
}
function findLatestRecord(records) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
        if (records[index] && typeof records[index] === "object")
            return records[index];
    }
    return null;
}
function summarizeClaudeRecord(record) {
    if (!record)
        return "Claude Code session activity";
    if (record.error || record.isApiErrorMessage)
        return "error";
    if (record.type === "user")
        return "user message";
    if (record.type === "assistant")
        return "assistant response";
    if (record.type === "system")
        return "system event";
    if (record.type)
        return record.type;
    return "Claude Code session activity";
}
function normalizeClaudeState(record, updatedAt, now) {
    if (record?.type === "assistant")
        return (0, shared_1.normalizeState)("completed", updatedAt, now);
    if (record?.type === "user")
        return (0, shared_1.normalizeState)("running", updatedAt, now);
    return (0, shared_1.normalizeState)(record?.status || record?.type, updatedAt, now);
}
