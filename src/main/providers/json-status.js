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
exports.readJsonStatusActivity = readJsonStatusActivity;
exports.normalizeState = normalizeState;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const codex_1 = require("./codex");
exports.VALID_STATES = new Set(["idle", "running", "waiting", "failed", "review"]);
async function readJsonStatusActivity(statusFile, options = {}) {
    const now = options.now || new Date();
    if (!cleanString(statusFile))
        return emptyActivity("", now, "No status file configured");
    const resolved = path.resolve(cleanString(statusFile) || "");
    let parsed = null;
    let stat;
    try {
        stat = await fs.stat(resolved);
        parsed = JSON.parse(await fs.readFile(resolved, "utf8"));
    }
    catch (error) {
        return emptyActivity(resolved, now, error instanceof Error ? error.message : String(error));
    }
    const state = normalizeState(parsed?.state);
    const title = cleanString(parsed?.title) || "External agent";
    const detail = cleanString(parsed?.detail) || cleanString(parsed?.message) || "Status file activity";
    const updatedAt = cleanString(parsed?.updatedAt) || new Date(stat.mtimeMs).toISOString();
    const sessions = normalizeItems(parsed?.items, { title, detail, state, updatedAt });
    const active = sessions[0] || {
        id: "json-status",
        title,
        detail,
        state,
        petState: (0, codex_1.mapActivityToPetState)(state),
        updatedAt,
        latestEvent: detail,
    };
    return {
        source: "json-status",
        statusFile: resolved,
        invalidState: !exports.VALID_STATES.has(parsed?.state),
        offline: parsed?.offline === true,
        state: active.state,
        petState: (0, codex_1.mapActivityToPetState)(active.state),
        active,
        sessions,
        updatedAt,
    };
}
function emptyActivity(statusFile, now, error) {
    return {
        source: "json-status",
        statusFile,
        state: "idle",
        petState: "idle",
        active: {
            id: "json-status",
            title: "Waiting for status file",
            detail: error,
            state: "idle",
            petState: "idle",
            updatedAt: now.toISOString(),
            latestEvent: error,
        },
        sessions: [],
        updatedAt: now.toISOString(),
        error,
    };
}
function normalizeItems(items, fallback) {
    const source = Array.isArray(items) && items.length > 0 ? items : [fallback];
    return source.slice(0, 8).map((item, index) => {
        const state = normalizeState(item?.state);
        const detail = cleanString(item?.detail) || cleanString(item?.message) || fallback.detail;
        return {
            id: cleanString(item?.id) || `json-status-${index}`,
            title: cleanString(item?.title) || fallback.title,
            detail,
            state,
            phase: cleanString(item?.phase),
            gestureId: cleanString(item?.gestureId),
            petState: (0, codex_1.mapActivityToPetState)(state),
            updatedAt: cleanString(item?.updatedAt) || fallback.updatedAt,
            latestEvent: detail,
        };
    });
}
function normalizeState(value) {
    const state = typeof value === "string" ? value.toLowerCase() : "idle";
    return exports.VALID_STATES.has(state) ? state : "idle";
}
function cleanString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
