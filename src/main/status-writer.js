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
exports.writeStatusFile = writeStatusFile;
exports.parseEmitArgs = parseEmitArgs;
exports.emitUsage = emitUsage;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const json_status_1 = require("./providers/json-status");
async function writeStatusFile(filePath, input) {
    const resolved = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    const payload = {
        state: (0, json_status_1.normalizeState)(input.state),
        title: cleanString(input.title) || "External agent",
        detail: cleanString(input.detail) || cleanString(input.message) || "Status updated",
        updatedAt: cleanString(input.updatedAt) || new Date().toISOString(),
    };
    if (Array.isArray(input.items)) {
        payload.items = input.items.map((item, index) => ({
            id: cleanString(item.id) || `item-${index}`,
            state: (0, json_status_1.normalizeState)(item.state),
            title: cleanString(item.title) || payload.title,
            detail: cleanString(item.detail) || cleanString(item.message) || payload.detail,
            updatedAt: cleanString(item.updatedAt) || payload.updatedAt,
        }));
    }
    await fs.writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return { filePath: resolved, payload };
}
function parseEmitArgs(argv) {
    const args = { file: null, state: "idle", title: null, detail: null, message: null };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--file")
            args.file = argv[++index] || null;
        else if (arg.startsWith("--file="))
            args.file = arg.slice("--file=".length);
        else if (arg === "--state")
            args.state = argv[++index] || args.state;
        else if (arg.startsWith("--state="))
            args.state = arg.slice("--state=".length);
        else if (arg === "--title")
            args.title = argv[++index] || null;
        else if (arg.startsWith("--title="))
            args.title = arg.slice("--title=".length);
        else if (arg === "--detail")
            args.detail = argv[++index] || null;
        else if (arg.startsWith("--detail="))
            args.detail = arg.slice("--detail=".length);
        else if (arg === "--message")
            args.message = argv[++index] || null;
        else if (arg.startsWith("--message="))
            args.message = arg.slice("--message=".length);
    }
    return args;
}
function emitUsage() {
    return `Usage: agentwhisker-emit --file <status.json> --state <${[...json_status_1.VALID_STATES].join("|")}> --title <agent> --detail <message>`;
}
function cleanString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
