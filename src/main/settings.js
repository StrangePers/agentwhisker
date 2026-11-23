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
exports.MIN_WINDOW_HEIGHT = exports.MIN_WINDOW_WIDTH = exports.DEFAULT_SETTINGS = void 0;
exports.readSettings = readSettings;
exports.writeSettings = writeSettings;
exports.updateSettings = updateSettings;
exports.normalizeSettings = normalizeSettings;
exports.normalizePetSize = normalizePetSize;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const { randomUUID } = require("node:crypto");
const pendingUpdates = new Map();
const registry_1 = require("./providers/registry");
exports.DEFAULT_SETTINGS = {
    selectedPetId: "",
    selectedState: "auto",
    provider: "desktop",
    customSource: false,
    petSize: 112,
    idleAnimationMode: "continuous",
    showTaskLabel: true,
    showBusyBubble: true,
    limitsPanelOpen: false,
    statusFile: "",
    windowBounds: null,
};
exports.MIN_WINDOW_WIDTH = 220;
exports.MIN_WINDOW_HEIGHT = 460;
async function readSettings(settingsPath) {
    try {
        const parsed = JSON.parse(await fs.readFile(settingsPath, "utf8"));
        return normalizeSettings(parsed);
    }
    catch {
        return { ...exports.DEFAULT_SETTINGS };
    }
}
async function writeSettings(settingsPath, settings) {
    const normalized = normalizeSettings(settings);
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    const temporaryPath = `${settingsPath}.${randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
        await fs.rename(temporaryPath, settingsPath);
    } finally {
        await fs.unlink(temporaryPath).catch(() => {});
    }
    return normalized;
}
function updateSettings(settingsPath, patch) {
    const key = path.resolve(settingsPath);
    const previous = pendingUpdates.get(key) || Promise.resolve();
    const update = previous.catch(() => {}).then(async () => {
        const current = await readSettings(key);
        return writeSettings(key, { ...current, ...patch });
    });
    pendingUpdates.set(key, update);
    update.then(() => { if (pendingUpdates.get(key) === update) pendingUpdates.delete(key); },
                () => { if (pendingUpdates.get(key) === update) pendingUpdates.delete(key); });
    return update;
}
function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
        selectedPetId: cleanString(input.selectedPetId),
        selectedState: normalizeState(input.selectedState),
        customSource: input.customSource === true,
        provider: (0, registry_1.normalizeProvider)(input.provider || "desktop"),
        petSize: normalizePetSize(input.petSize),
        idleAnimationMode: input.idleAnimationMode === "events-only" ? "events-only" : exports.DEFAULT_SETTINGS.idleAnimationMode,
        showTaskLabel: input.showTaskLabel !== false,
        showBusyBubble: input.showBusyBubble !== false,
        limitsPanelOpen: input.limitsPanelOpen === true,
        statusFile: cleanString(input.statusFile),
        windowBounds: normalizeBounds(input.windowBounds),
    };
}
function normalizePetSize(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return exports.DEFAULT_SETTINGS.petSize;
    return Math.min(360, Math.max(72, Math.round(parsed)));
}
function normalizeState(value) {
    const valid = new Set(["auto", "idle", "running", "running-right", "running-left", "waving", "jumping", "waiting", "review", "failed"]);
    return valid.has(value) ? value : "auto";
}
function normalizeBounds(value) {
    if (!value || typeof value !== "object")
        return null;
    const input = value;
    const width = finiteNumber(input.width);
    const height = finiteNumber(input.height);
    if (!width || !height)
        return null;
    return {
        x: finiteNumber(input.x),
        y: finiteNumber(input.y),
        width: Math.max(exports.MIN_WINDOW_WIDTH, width),
        height: Math.max(exports.MIN_WINDOW_HEIGHT, height),
    };
}
function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function cleanString(value) {
    return typeof value === "string" ? value.trim() : "";
}
