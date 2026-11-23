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
exports.readT3CodeActivity = readT3CodeActivity;
exports.runT3CodeSessionList = runT3CodeSessionList;
exports.normalizeT3CodeSessions = normalizeT3CodeSessions;
exports.readT3CodeLocalSessions = readT3CodeLocalSessions;
exports.normalizeDraftStore = normalizeDraftStore;
exports.extractLocalStorageJson = extractLocalStorageJson;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const codex_1 = require("./codex");
const shared_1 = require("./shared");
async function readT3CodeActivity(options = {}) {
    const now = options.now || new Date();
    const runner = options.runner || runT3CodeSessionList;
    try {
        const sessions = normalizeT3CodeSessions(await runner(options), now);
        return (0, shared_1.aggregateActivity)("t3code", sessions, now);
    }
    catch (error) {
        const sessions = await readT3CodeLocalSessions(options, now);
        if (sessions.length > 0)
            return (0, shared_1.aggregateActivity)("t3code", sessions, now, { mode: "local-storage" });
        return (0, shared_1.aggregateActivity)("t3code", [], now, { error: error instanceof Error ? error.message : String(error) });
    }
}
async function runT3CodeSessionList(options = {}) {
    const maxCount = Number.isFinite(options.maxCount) ? String(options.maxCount) : "8";
    const commands = options.commands || ["t3code", "t3"];
    let lastError = null;
    for (const command of commands) {
        try {
            return await (0, shared_1.execJson)(command, ["session", "list", "--format", "json", "--max-count", maxCount], options);
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error("T3Code CLI not available");
}
function normalizeT3CodeSessions(output, now = new Date()) {
    return (0, shared_1.normalizeCommandSessions)(output, "t3code", now).map((session) => {
        if (session.state === "running" && isCompletedText(session.latestEvent)) {
            return { ...session, state: "review", petState: "review" };
        }
        return session;
    });
}
async function readT3CodeLocalSessions(options = {}, now = new Date()) {
    const roots = options.roots || defaultT3CodeRoots();
    const sessions = [];
    for (const root of roots) {
        const leveldbRoot = path.join(root, "Local Storage", "leveldb");
        const files = await (0, shared_1.findRecentFiles)(leveldbRoot, (_fullPath, name) => /\.(log|ldb)$/.test(name), 8);
        for (const file of files) {
            const text = await fs.readFile(file.filePath, "latin1").catch(() => "");
            for (const draftStore of extractLocalStorageJson(text, "t3code:composer-drafts:v1")) {
                sessions.push(...normalizeDraftStore(draftStore, { root, file, now }));
            }
        }
    }
    return dedupeSessions(sessions)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 8);
}
function defaultT3CodeRoots() {
    const appData = process.env.APPDATA;
    return appData ? [path.join(appData, "t3code"), path.join(appData, "t3code-dev")] : [];
}
function normalizeDraftStore(store, context) {
    const state = store?.state && typeof store.state === "object" ? store.state : {};
    const drafts = state.draftsByThreadKey || state.draftsByThreadId || {};
    const draftThreads = state.draftThreadsByThreadKey || state.draftThreadsByThreadId || {};
    const sessions = [];
    for (const [key, thread] of Object.entries(draftThreads)) {
        if (!thread || typeof thread !== "object")
            continue;
        const draft = drafts[key] || {};
        sessions.push(normalizeDraftThread(key, thread, draft, context));
    }
    for (const [key, draft] of Object.entries(drafts)) {
        if (draftThreads[key])
            continue;
        sessions.push(normalizeDraftThread(key, {}, draft, context));
    }
    return sessions.filter(Boolean);
}
function normalizeDraftThread(key, thread, draft, context) {
    const updatedAt = (0, shared_1.cleanString)(thread.updatedAt) || (0, shared_1.cleanString)(thread.createdAt) || new Date(context.file.stat.mtimeMs).toISOString();
    const prompt = (0, shared_1.cleanString)(draft.prompt);
    const project = (0, shared_1.cleanString)(thread.logicalProjectKey) || (0, shared_1.cleanString)(thread.projectId) || (0, shared_1.cleanString)(thread.environmentId);
    const branch = (0, shared_1.cleanString)(thread.branch);
    const title = project ? labelProject(project) : `T3Code thread ${String(key).slice(0, 8)}`;
    const state = prompt && isRecent(updatedAt, context.now, 30 * 60 * 1000) ? "waiting" : "idle";
    return {
        id: (0, shared_1.cleanString)(thread.threadId) || String(key),
        title,
        detail: prompt ? "draft waiting to send" : branch ? `branch: ${branch}` : "draft thread",
        state,
        petState: (0, codex_1.mapActivityToPetState)(state),
        updatedAt,
        latestEvent: prompt ? "draft waiting to send" : "draft thread",
        directory: (0, shared_1.cleanString)(thread.worktreePath),
        projectId: (0, shared_1.cleanString)(thread.projectId),
        sourcePath: context.file.filePath,
    };
}
function isRecent(value, now, windowMs) {
    const ageMs = now.getTime() - new Date(String(value)).getTime();
    return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= windowMs;
}
function extractLocalStorageJson(text, key) {
    const results = [];
    let offset = 0;
    while (offset < text.length) {
        const keyIndex = text.indexOf(key, offset);
        if (keyIndex === -1)
            break;
        const jsonStart = text.indexOf("{", keyIndex + key.length);
        if (jsonStart === -1)
            break;
        const jsonText = extractBalancedObject(text, jsonStart);
        if (jsonText) {
            try {
                results.push(JSON.parse(jsonText));
            }
            catch {
                // Ignore stale or compressed LevelDB fragments.
            }
            offset = jsonStart + jsonText.length;
        }
        else {
            offset = jsonStart + 1;
        }
    }
    return results;
}
function extractBalancedObject(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (char === "\\")
                escaped = true;
            else if (char === "\"")
                inString = false;
            continue;
        }
        if (char === "\"")
            inString = true;
        else if (char === "{")
            depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0)
                return text.slice(start, index + 1);
        }
    }
    return null;
}
function dedupeSessions(sessions) {
    const byId = new Map();
    for (const session of sessions) {
        const current = byId.get(session.id);
        if (!current || new Date(session.updatedAt).getTime() >= new Date(current.updatedAt).getTime())
            byId.set(session.id, session);
    }
    return [...byId.values()];
}
function labelProject(value) {
    const text = String(value);
    if (text.includes("\\"))
        return path.basename(text);
    if (text.includes("/"))
        return text.split("/").filter(Boolean).slice(-2).join("/");
    if (text.includes(":"))
        return text.split(":").pop() || text;
    return text;
}
function isCompletedText(value) {
    return ["complete", "completed", "done", "finished", "success", "succeeded", "review"].includes(String(value || "").toLowerCase());
}
