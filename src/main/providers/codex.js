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
exports.readCodexActivity = readCodexActivity;
exports.resolveRecentCodexSessions = resolveRecentCodexSessions;
exports.readSessionIndex = readSessionIndex;
exports.findSessionPath = findSessionPath;
exports.classifySession = classifySession;
exports.isReviewPayload = isReviewPayload;
exports.mapActivityToPetState = mapActivityToPetState;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const ACTIVE_WINDOW_MS = 90 * 1000;
const REVIEW_WINDOW_MS = 20 * 60 * 1000;
const SESSION_HEAD_BYTES = 64 * 1024;
const SESSION_TAIL_BYTES = 96 * 1024;
async function readCodexActivity(codexHome, options = {}) {
    const now = options.now || new Date();
    const sessionIndexPath = path.join(codexHome, "session_index.jsonl");
    const entries = await readSessionIndex(sessionIndexPath);
    const recent = await resolveRecentCodexSessions(codexHome, entries);
    const sessions = [];
    for (const entry of recent) {
        const sessionPath = entry.sessionPath || null;
        const sample = sessionPath ? await readSessionSample(sessionPath) : null;
        sessions.push(classifySession(entry, sessionPath, sample, now));
    }
    const active = sessions.find((item) => item.state === "running" || item.state === "waiting") || sessions[0] || null;
    const aggregateState = active?.state || "idle";
    return {
        source: "codex",
        codexHome,
        state: aggregateState,
        petState: mapActivityToPetState(aggregateState),
        active,
        sessions,
        updatedAt: now.toISOString(),
    };
}
async function resolveRecentCodexSessions(codexHome, indexEntries, limit = 8) {
    const byId = new Map();
    for (const entry of indexEntries) {
        if (!entry?.id)
            continue;
        byId.set(entry.id, {
            id: entry.id,
            thread_name: entry.thread_name,
            updated_at: entry.updated_at,
            sessionPath: null,
            sortTime: new Date(entry.updated_at).getTime(),
        });
    }
    for (const file of await findRecentSessionFiles(codexHome, Math.max(limit * 2, 16))) {
        const meta = await readSessionFileMeta(file.filePath);
        const id = meta?.id || extractSessionIdFromPath(file.filePath);
        if (!id)
            continue;
        const previous = byId.get(id) || {};
        const fileUpdatedAt = new Date(file.stat.mtimeMs).toISOString();
        byId.set(id, {
            ...previous,
            id,
            thread_name: previous.thread_name || meta?.thread_name || meta?.title || titleFromCwd(meta?.cwd) || titleFromSessionPath(file.filePath),
            updated_at: fileUpdatedAt,
            sessionPath: file.filePath,
            sortTime: file.stat.mtimeMs,
        });
    }
    return [...byId.values()]
        .sort((left, right) => (right.sortTime || 0) - (left.sortTime || 0))
        .slice(0, limit);
}
async function readSessionIndex(filePath) {
    let text = "";
    try {
        text = await fs.readFile(filePath, "utf8");
    }
    catch {
        return [];
    }
    return text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => parseJsonLine(line))
        .filter((entry) => entry && entry.id && entry.updated_at);
}
async function findRecentSessionFiles(codexHome, limit) {
    const root = path.join(codexHome, "sessions");
    const files = [];
    const stack = [root];
    while (stack.length > 0) {
        const dir = stack.pop();
        if (!dir)
            continue;
        let entries = [];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory())
                stack.push(fullPath);
            else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
                try {
                    files.push({ filePath: fullPath, stat: await fs.stat(fullPath) });
                }
                catch {
                    // Ignore races from active session writers.
                }
            }
        }
    }
    return files.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs).slice(0, limit);
}
async function findSessionPath(codexHome, sessionId) {
    const sessionsRoot = path.join(codexHome, "sessions");
    const stack = [sessionsRoot];
    while (stack.length > 0) {
        const dir = stack.pop();
        if (!dir)
            continue;
        let entries = [];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory())
                stack.push(fullPath);
            else if (entry.isFile() && entry.name.endsWith(".jsonl") && entry.name.includes(sessionId))
                return fullPath;
        }
    }
    return null;
}
async function readSessionSample(filePath) {
    let stat;
    let text = "";
    try {
        stat = await fs.stat(filePath);
        text = await readSessionHeadAndTail(filePath, stat.size);
    }
    catch {
        return null;
    }
    const allLines = text.split(/\r?\n/).filter(Boolean);
    const lines = [...allLines.slice(0, 40), ...allLines.slice(-120)];
    const records = lines.map((line) => parseJsonLine(line)).filter(Boolean);
    return {
        filePath,
        mtimeMs: stat.mtimeMs,
        records,
    };
}
async function readSessionHeadAndTail(filePath, size) {
    const handle = await fs.open(filePath, "r");
    try {
        if (size <= SESSION_HEAD_BYTES + SESSION_TAIL_BYTES) {
            const buffer = Buffer.alloc(size);
            const { bytesRead } = await handle.read(buffer, 0, size, 0);
            return buffer.subarray(0, bytesRead).toString("utf8");
        }
        const headBuffer = Buffer.alloc(SESSION_HEAD_BYTES);
        const tailBuffer = Buffer.alloc(SESSION_TAIL_BYTES);
        const { bytesRead: headBytes } = await handle.read(headBuffer, 0, headBuffer.length, 0);
        const { bytesRead: tailBytes } = await handle.read(tailBuffer, 0, tailBuffer.length, Math.max(0, size - SESSION_TAIL_BYTES));
        return `${headBuffer.subarray(0, headBytes).toString("utf8")}\n${tailBuffer.subarray(0, tailBytes).toString("utf8")}`;
    }
    finally {
        await handle.close();
    }
}
async function readSessionFileMeta(filePath) {
    try {
        const handle = await fs.open(filePath, "r");
        try {
            const buffer = Buffer.alloc(64 * 1024);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            const firstLine = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/, 1)[0];
            const record = parseJsonLine(firstLine);
            return record?.type === "session_meta" && record.payload ? record.payload : null;
        }
        finally {
            await handle.close();
        }
    }
    catch {
        return null;
    }
}
function classifySession(entry, sessionPath, sample, now) {
    const updatedAt = new Date(entry.updated_at);
    const lastWriteAgeMs = sample ? now.getTime() - sample.mtimeMs : now.getTime() - updatedAt.getTime();
    const records = sample?.records || [];
    const latestPayload = findLatestPayload(records);
    const stickyCompleted = hasStickyCompletion(records);
    const pendingToolCall = !stickyCompleted && hasPendingToolCall(records);
    const recentlyActive = !stickyCompleted && lastWriteAgeMs <= ACTIVE_WINDOW_MS && hasRecentActivePayload(records);
    const requestedInput = isRequestUserInputPayload(latestPayload);
    const failed = isFailurePayload(latestPayload);
    const completed = isCompletionPayload(latestPayload);
    let state = "idle";
    if (stickyCompleted)
        state = "review";
    else if (requestedInput)
        state = "waiting";
    else if (pendingToolCall || recentlyActive)
        state = "running";
    else if (failed)
        state = "failed";
    else if (completed)
        state = "review";
    else if (isActiveWorkPayload(latestPayload) && lastWriteAgeMs <= ACTIVE_WINDOW_MS)
        state = "running";
    else if (isReviewPayload(latestPayload) && lastWriteAgeMs <= REVIEW_WINDOW_MS)
        state = "review";
    else if (!latestPayload && lastWriteAgeMs <= ACTIVE_WINDOW_MS)
        state = "running";
    else if (lastWriteAgeMs <= REVIEW_WINDOW_MS)
        state = "review";
    return {
        id: entry.id,
        title: titleFromFirstUserMessage(records) || normalizeCodexTitle(entry.thread_name) || "Untitled Codex thread",
        updatedAt: updatedAt.toISOString(),
        state: state,
        petState: mapActivityToPetState(state),
        sessionPath,
        lastWriteAgeMs,
        latestEvent: summarizePayload(latestPayload),
    };
}
function hasPendingToolCall(records) {
    const calls = new Map();
    for (const record of records) {
        const payload = record.payload;
        if (!payload || payload.type !== "function_call")
            continue;
        calls.set(payload.call_id, true);
    }
    for (const record of records) {
        const payload = record.payload;
        if (!payload || payload.type !== "function_call_output")
            continue;
        calls.delete(payload.call_id);
    }
    return calls.size > 0;
}
function hasStickyCompletion(records) {
    const completionIndex = findLatestCompletionIndex(records);
    if (completionIndex < 0)
        return false;
    for (let index = completionIndex + 1; index < records.length; index += 1) {
        if (isWorkStartRecord(records[index]))
            return false;
    }
    return true;
}
function findLatestCompletionIndex(records) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
        if (isCompletionPayload(records[index]?.payload))
            return index;
    }
    return -1;
}
function isWorkStartRecord(record) {
    const payload = record?.payload;
    if (!payload || typeof payload !== "object")
        return false;
    if (payload.type === "task_started")
        return true;
    if (payload.type === "function_call" || payload.type === "custom_tool_call")
        return true;
    if (payload.type === "reasoning")
        return true;
    if (payload.type === "agent_message" && payload.phase === "commentary")
        return true;
    if (payload.type === "message" && payload.role === "user")
        return true;
    if (payload.type === "message" && payload.phase === "commentary")
        return true;
    if (payload.type === "user_message")
        return true;
    return false;
}
function hasRecentActivePayload(records) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const payload = records[index]?.payload;
        if (isPassivePayload(payload))
            continue;
        if (isCompletionPayload(payload))
            return false;
        if (isActiveWorkPayload(payload))
            return true;
    }
    return false;
}
function findLatestPayload(records) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const payload = records[index]?.payload;
        if (isPassivePayload(payload))
            continue;
        if (payload && typeof payload === "object")
            return payload;
    }
    return null;
}
function isPassivePayload(payload) {
    if (!payload || typeof payload !== "object")
        return false;
    if (payload.type === "token_count")
        return true;
    if (payload.type === "message" && (payload.role === "developer" || payload.role === "system"))
        return true;
    return false;
}
function isRequestUserInputPayload(payload) {
    if (!payload || typeof payload !== "object")
        return false;
    if (payload.type !== "function_call" && payload.type !== "custom_tool_call")
        return false;
    return payload.name === "request_user_input";
}
function summarizePayload(payload) {
    if (!payload)
        return null;
    if (payload.type === "function_call")
        return `tool: ${payload.name || "unknown"}`;
    if (payload.type === "function_call_output")
        return "tool output";
    if (payload.type === "custom_tool_call_output")
        return "tool output";
    if (payload.type === "message")
        return "message";
    if (payload.type)
        return payload.type;
    return null;
}
function titleFromFirstUserMessage(records) {
    for (const record of records) {
        const payload = record?.payload;
        if (!payload || typeof payload !== "object" || payload.type !== "user_message")
            continue;
        const title = normalizeCodexTitle(payload.message);
        if (title && !isBootstrapUserTitle(title))
            return title;
    }
    for (const record of records) {
        const payload = record?.payload;
        if (!payload || typeof payload !== "object")
            continue;
        const text = payload.type === "message" && payload.role === "user" ? textFromMessageContent(payload.content) : null;
        const title = normalizeCodexTitle(text);
        if (title && !isBootstrapUserTitle(title))
            return title;
    }
    return null;
}
function isBootstrapUserTitle(title) {
    return title.startsWith("# AGENTS.md instructions") || title.startsWith("<environment_context>") || title.startsWith("<INSTRUCTIONS>");
}
function textFromMessageContent(content) {
    if (typeof content === "string")
        return content;
    if (!Array.isArray(content))
        return null;
    return content
        .map((item) => (typeof item === "string" ? item : typeof item?.text === "string" ? item.text : ""))
        .join(" ")
        .trim();
}
function normalizeCodexTitle(value) {
    if (typeof value !== "string" || !value.trim())
        return null;
    const firstLine = value
        .trim()
        .split(/\r?\n/, 1)[0]
        .replace(/\s+/g, " ")
        .trim();
    if (!firstLine)
        return null;
    return firstLine.length > 120 ? `${firstLine.slice(0, 117).trim()}...` : firstLine;
}
function extractSessionIdFromPath(filePath) {
    const match = path.basename(filePath).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
    return match?.[1] || null;
}
function titleFromSessionPath(filePath) {
    const name = path.basename(filePath, ".jsonl");
    const title = name.replace(/^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, "");
    return extractSessionIdFromPath(filePath) === title ? "Codex thread" : title || "Codex thread";
}
function titleFromCwd(value) {
    if (typeof value !== "string" || !value.trim())
        return null;
    const trimmed = value.trim();
    const name = trimmed.includes("\\") ? path.win32.basename(trimmed) : path.basename(trimmed);
    if (!name)
        return null;
    const title = name
        .replace(/^\d{4}-\d{2}-\d{2}-/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!title)
        return null;
    const normalized = title
        .replace(/\bcodex s\b/gi, "codex's")
        .replace(/\bi\b/g, "I")
        .replace(/^[a-z]/, (letter) => letter.toUpperCase());
    return normalizeCodexTitle(normalized);
}
function isReviewPayload(payload) {
    if (!payload || typeof payload !== "object")
        return false;
    if (payload.type === "message")
        return true;
    if (payload.type === "function_call_output")
        return true;
    if (payload.type === "reasoning")
        return true;
    return false;
}
function isActiveWorkPayload(payload) {
    if (!payload || typeof payload !== "object")
        return false;
    if (payload.type === "task_started")
        return true;
    if (payload.type === "function_call")
        return true;
    if (payload.type === "custom_tool_call")
        return true;
    if (payload.type === "function_call_output")
        return true;
    if (payload.type === "custom_tool_call_output")
        return true;
    if (payload.type === "reasoning")
        return true;
    if (payload.type === "agent_message" && payload.phase === "commentary")
        return true;
    if (payload.type === "message" && payload.phase === "commentary")
        return true;
    return false;
}
function isFailurePayload(payload) {
    if (!payload || typeof payload !== "object")
        return false;
    const type = typeof payload.type === "string" ? payload.type.toLowerCase() : "";
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
    if (["failed", "failure", "error"].includes(type))
        return true;
    if (["failed", "failure", "error"].includes(status))
        return true;
    return false;
}
function isCompletionPayload(payload) {
    if (!payload || typeof payload !== "object")
        return false;
    const type = typeof payload.type === "string" ? payload.type.toLowerCase() : "";
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
    if (["task_complete", "complete", "completed"].includes(type))
        return true;
    if (["complete", "completed", "done"].includes(status))
        return true;
    return false;
}
function mapActivityToPetState(state) {
    if (state === "running")
        return "running";
    if (state === "waiting")
        return "waiting";
    if (state === "failed")
        return "failed";
    if (state === "review")
        return "review";
    return "idle";
}
function parseJsonLine(line) {
    try {
        return JSON.parse(line);
    }
    catch {
        return null;
    }
}
