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
exports.readOpenCodeActivity = readOpenCodeActivity;
exports.runOpenCodeSessionList = runOpenCodeSessionList;
exports.runOpenCodeDbSessionList = runOpenCodeDbSessionList;
exports.normalizeSessions = normalizeSessions;
exports.readOpenCodeBridgeSessions = readOpenCodeBridgeSessions;
exports.getDefaultOpenCodeBridgeFile = getDefaultOpenCodeBridgeFile;
exports.normalizeOpenCodeBridgeSessions = normalizeOpenCodeBridgeSessions;
exports.mergeOpenCodeSessions = mergeOpenCodeSessions;
exports.normalizeDbSession = normalizeDbSession;
exports.classifyOpenCodeState = classifyOpenCodeState;
const fs = __importStar(require("node:fs/promises"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const codex_1 = require("./codex");
const shared_1 = require("./shared");
const { connectOpenCodeService } = require("./opencode-service.cjs");
async function readOpenCodeActivity(options = {}) {
    const now = options.now || new Date();
    const runner = options.runner || runOpenCodeSessionList;
    const bridgeSessions = await readOpenCodeBridgeSessions(options, now);
    try {
        const sessions = displayableOpenCodeSessions(mergeOpenCodeSessions(bridgeSessions, normalizeSessions(await runner(options), now)));
        return (0, shared_1.aggregateActivity)("opencode", sessions, now);
    }
    catch (error) {
        const sessions = displayableOpenCodeSessions(bridgeSessions);
        if (sessions.length > 0)
            return (0, shared_1.aggregateActivity)("opencode", sessions, now);
        return (0, shared_1.aggregateActivity)("opencode", [], now, { error: error instanceof Error ? error.message : String(error) });
    }
}
async function runOpenCodeSessionList(options = {}) {
    const limit = Math.max(1, Math.min(50, Number(options.maxCount) || 8));
    if (!options.databasePath || options.serviceFile) {
        const serverSessions = await readOpenCodeServiceSessions(options, limit);
        if (serverSessions) return serverSessions;
    }
    try {
        return await runOpenCodeDbSessionList(limit, options);
    } catch (error) {
        if (options.databasePath) throw error;
        return (0, shared_1.execJson)("opencode", ["session", "list", "--format", "json", "--max-count", String(limit)], options);
    }
}

async function readOpenCodeServiceSessions(options, limit) {
    try {
        const request = await connectOpenCodeService(options.serviceFile || undefined);
        const get = async endpoint => {
            try {
                const response = await request(endpoint);
                return response.ok ? (await response.json()).data : null;
            } catch { return null; }
        };
        const [sessions, forms, permissions] = await Promise.all([
            get("/api/session?archived=false&parentID=null&limit=" + limit),
            get("/api/form"),
            get("/api/permission/request"),
        ]);
        if (!Array.isArray(sessions)) return null;
        const waiting = new Set([...asList(forms), ...asList(permissions)].map(entry => entry.sessionID));
        return sessions.map(session => ({
            schema: "opencode-v2", connected: true, waiting: waiting.has(session.id),
            id: session.id, title: session.title, directory: session.location?.directory, project_id: session.projectID,
            time_updated: session.time?.updated, time_busy: session.time?.busy, time_idle: session.time?.idle,
            idle_outcome: session.outcome,
        }));
    } catch { return null; }
}

function asList(value) {
    return Array.isArray(value) ? value : [];
}

async function runOpenCodeDbSessionList(limit, options = {}) {
    const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
    const file = options.databasePath || path.join(dataHome, "opencode", "opencode.db");
    await fs.access(file);
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(file, { readOnly: true });
    try {
        const v2 = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_v2'").get();
        if (v2) {
            return db.prepare(`
                SELECT 'opencode-v2' AS schema, id, title, directory, project_id, time_updated, time_busy, time_idle, idle_outcome
                FROM session_v2 WHERE time_archived IS NULL AND parent_id IS NULL ORDER BY time_updated DESC LIMIT ?
            `).all(limit);
        }
        return db.prepare(`
            SELECT s.id, s.title, s.directory, s.project_id, s.time_created, s.time_updated,
                m.data AS message_data, p.data AS part_data
            FROM session s
            LEFT JOIN message m ON m.id = (
                SELECT id FROM message WHERE session_id = s.id ORDER BY time_updated DESC LIMIT 1
            )
            LEFT JOIN part p ON p.id = (
                SELECT id FROM part WHERE session_id = s.id ORDER BY time_updated DESC LIMIT 1
            )
            WHERE s.time_archived IS NULL ORDER BY s.time_updated DESC LIMIT ?
        `).all(limit);
    } finally {
        db.close();
    }
}

function normalizeV2Session(item, now) {
    const stamp = value => typeof value === "number" ? value : Date.parse(value);
    const busyAt = stamp(item.time_busy);
    const idleAt = stamp(item.time_idle);
    const recent = +now - (stamp(item.time_updated) || busyAt || idleAt);
    let state = "idle";
    if (item.waiting) state = "waiting";
    else if (Number.isFinite(busyAt) && (!Number.isFinite(idleAt) || busyAt > idleAt) &&
        (item.connected || recent <= 90_000)) state = "running";
    else if (Number.isFinite(idleAt) && +now - idleAt <= 20 * 60_000) {
        if (item.idle_outcome === "failed") state = "failed";
        if (item.idle_outcome === "succeeded") state = "review";
    }
    return {
        id: item.id,
        title: item.title || item.directory || "OpenCode session",
        detail: "OpenCode",
        state,
        petState: (0, codex_1.mapActivityToPetState)(state),
        updatedAt: new Date(stamp(item.time_updated) || +now).toISOString(),
        directory: item.directory,
        projectId: item.project_id,
    };
}

function normalizeSessions(output, now = new Date()) {
    const rows = Array.isArray(output) ? output : Array.isArray(output?.sessions) ? output.sessions : [];
    if (rows.some(item => item?.schema === "opencode-v2")) {
        return rows.filter(item => item?.schema === "opencode-v2").map(item => normalizeV2Session(item, now));
    }
    if (rows.some((item) => item && ("time_updated" in item || "message_data" in item || "part_data" in item))) {
        return rows
            .map((item, index) => normalizeDbSession(item, index, now))
            .filter(Boolean)
            .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
            .slice(0, 8);
    }
    return (0, shared_1.normalizeCommandSessions)(output, "opencode", now);
}
async function readOpenCodeBridgeSessions(options = {}, now = new Date()) {
    const bridgeFile = (0, shared_1.cleanString)(options.bridgeFile) || (0, shared_1.cleanString)(process.env.AGENTWHISKER_OPENCODE_STATUS_FILE) || (0, shared_1.cleanString)(process.env.PINGFOLK_OPENCODE_STATUS_FILE) || (0, shared_1.cleanString)(process.env.PIPGLANCE_OPENCODE_STATUS_FILE) || (0, shared_1.cleanString)(process.env.AGENT_PETS_OPENCODE_STATUS_FILE) || getDefaultOpenCodeBridgeFile();
    try {
        const parsed = JSON.parse(await fs.readFile(bridgeFile, "utf8"));
        return normalizeOpenCodeBridgeSessions(parsed, now);
    }
    catch {
        return [];
    }
}
function getDefaultOpenCodeBridgeFile() {
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
        return path.join(localAppData, "Agent Pets", "providers", "opencode.json");
    }
    const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
    return path.join(stateHome, "agent-pets", "providers", "opencode.json");
}
function normalizeOpenCodeBridgeSessions(payload, now = new Date()) {
    if (!payload || typeof payload !== "object")
        return [];
    const rows = Array.isArray(payload.sessions) ? payload.sessions : Array.isArray(payload.items) ? payload.items : [];
    return rows
        .map((item, index) => normalizeOpenCodeBridgeSession(item, index, now))
        .filter(Boolean)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 8);
}
function normalizeOpenCodeBridgeSession(item, index, now) {
    if (!item || typeof item !== "object")
        return null;
    const updatedAt = (0, shared_1.cleanString)(item.updatedAt) || now.toISOString();
    const state = normalizeBridgeState(item.state, updatedAt, now);
    const detail = (0, shared_1.cleanString)(item.detail) || (0, shared_1.cleanString)(item.latestEvent) || "OpenCode plugin activity";
    return {
        id: (0, shared_1.cleanString)(item.id) || (0, shared_1.cleanString)(item.sessionID) || (0, shared_1.cleanString)(item.sessionId) || `opencode-plugin-${index}`,
        title: (0, shared_1.cleanString)(item.title) || (0, shared_1.cleanString)(item.cwd) || `OpenCode session ${index + 1}`,
        detail,
        state,
        petState: (0, codex_1.mapActivityToPetState)(state),
        updatedAt,
        latestEvent: detail,
        directory: (0, shared_1.cleanString)(item.cwd) || (0, shared_1.cleanString)(item.directory),
        projectId: (0, shared_1.cleanString)(item.projectId) || (0, shared_1.cleanString)(item.project_id),
        source: "opencode-plugin",
    };
}
function normalizeBridgeState(value, updatedAt, now) {
    const state = (0, shared_1.cleanString)(value)?.toLowerCase() || "";
    if (state === "running" || state === "waiting") {
        const ageMs = now.getTime() - new Date(updatedAt).getTime();
        if (Number.isFinite(ageMs) && ageMs > 30 * 60 * 1000)
            return "idle";
        if (Number.isFinite(ageMs) && ageMs > 5 * 60 * 1000)
            return "review";
        return state;
    }
    return (0, shared_1.normalizeState)(state, updatedAt, now);
}
function mergeOpenCodeSessions(preferredSessions, fallbackSessions) {
    const merged = [];
    const seen = new Set();
    const fallbackById = new Map(fallbackSessions.map((session) => [session.id, session]));
    for (const session of preferredSessions) {
        if (!session || seen.has(session.id))
            continue;
        seen.add(session.id);
        merged.push(mergePreferredSession(session, fallbackById.get(session.id)));
    }
    for (const session of fallbackSessions) {
        if (!session || seen.has(session.id))
            continue;
        seen.add(session.id);
        merged.push(session);
    }
    return merged
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 8);
}
function mergePreferredSession(session, fallback) {
    if (!fallback)
        return session;
    const next = isGenericBridgeRunning(session) && isTerminalOpenCodeState(fallback.state)
        ? {
            ...session,
            state: fallback.state,
            petState: fallback.petState,
            detail: fallback.detail,
            latestEvent: fallback.latestEvent,
            updatedAt: fallback.updatedAt,
        }
        : session;
    if (!isOpenCodePlaceholderTitle(next.title) || isOpenCodePlaceholderTitle(fallback.title)) {
        return {
            ...next,
            directory: next.directory || fallback.directory,
            projectId: next.projectId || fallback.projectId,
        };
    }
    return {
        ...next,
        title: fallback.title,
        directory: next.directory || fallback.directory,
        projectId: next.projectId || fallback.projectId,
    };
}
function isGenericBridgeRunning(session) {
    const detail = (0, shared_1.cleanString)(session.latestEvent) || (0, shared_1.cleanString)(session.detail) || "";
    return (session.source === "opencode-plugin" &&
        session.state === "running" &&
        ["message updated", "message part updated", "session running", "session busy", "session active", "session streaming"].includes(detail.toLowerCase()));
}
function isTerminalOpenCodeState(state) {
    return state === "review" || state === "failed";
}
function displayableOpenCodeSessions(sessions) {
    return sessions.filter((session) => session.state !== "idle");
}
function isOpenCodePlaceholderTitle(value) {
    const title = (0, shared_1.cleanString)(value)?.toLowerCase() || "";
    return title === "opencode session" || /^opencode session \d+$/.test(title);
}
function normalizeDbSession(item, index, now) {
    if (!item || typeof item !== "object")
        return null;
    const message = parseJson(item.message_data);
    const part = parseJson(item.part_data);
    const updatedAt = (0, shared_1.timestampString)(item.time_updated) || (0, shared_1.timestampString)(item.updated) || now.toISOString();
    const title = (0, shared_1.cleanString)(item.title) || (0, shared_1.cleanString)(item.directory) || `OpenCode session ${index + 1}`;
    const detail = summarizeOpenCodeEvent(message, part);
    const state = classifyOpenCodeState(message, part, updatedAt, now);
    return {
        id: (0, shared_1.cleanString)(item.id) || `opencode-${index}`,
        title,
        detail,
        state,
        petState: (0, codex_1.mapActivityToPetState)(state),
        updatedAt,
        latestEvent: detail,
        directory: (0, shared_1.cleanString)(item.directory),
        projectId: (0, shared_1.cleanString)(item.project_id),
    };
}
function classifyOpenCodeState(message, part, updatedAt, now) {
    if (message?.error || part?.error)
        return recentTerminalState("failed", updatedAt, now);
    if (part?.type === "step-finish") {
        if (part.reason === "error" || part.reason === "failed")
            return recentTerminalState("failed", updatedAt, now);
        if (part.reason === "stop")
            return recentTerminalState("review", updatedAt, now);
        return (0, shared_1.normalizeState)("running", updatedAt, now);
    }
    if (message?.time?.completed || message?.finish === "stop")
        return recentTerminalState("review", updatedAt, now);
    if (message?.role === "assistant" && !message?.time?.completed)
        return (0, shared_1.normalizeState)("running", updatedAt, now);
    if (message?.role === "user")
        return (0, shared_1.normalizeState)("running", updatedAt, now);
    return (0, shared_1.normalizeState)(null, updatedAt, now);
}
function recentTerminalState(state, updatedAt, now) {
    const ageMs = now.getTime() - new Date(updatedAt).getTime();
    return Number.isFinite(ageMs) && ageMs > 30 * 60 * 1000 ? "idle" : state;
}
function summarizeOpenCodeEvent(message, part) {
    if (message?.error || part?.error)
        return "error";
    if (part?.type === "step-finish")
        return part.reason ? `finished: ${part.reason}` : "finished";
    if (part?.type === "tool")
        return "tool";
    if (part?.type === "text")
        return "response text";
    if (part?.type)
        return part.type;
    if (message?.role === "assistant")
        return message?.time?.completed ? "assistant response" : "assistant running";
    if (message?.role === "user")
        return "user message";
    return "OpenCode session activity";
}
function parseJson(value) {
    const text = (0, shared_1.cleanString)(value);
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
