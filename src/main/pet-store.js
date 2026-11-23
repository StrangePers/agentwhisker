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
exports.CELL_HEIGHT = exports.CELL_WIDTH = exports.ATLAS_ROWS = exports.ATLAS_COLUMNS = exports.ATLAS_HEIGHT = exports.ATLAS_WIDTH = void 0;
exports.safeReadJson = safeReadJson;
exports.readPetFolder = readPetFolder;
exports.readPets = readPets;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const image_info_1 = require("./image-info");
exports.ATLAS_WIDTH = 1536;
exports.ATLAS_HEIGHT = 1872;
exports.ATLAS_COLUMNS = 8;
exports.ATLAS_ROWS = 9;
exports.CELL_WIDTH = 192;
exports.CELL_HEIGHT = 208;
async function safeReadJson(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, "utf8"));
    }
    catch {
        return null;
    }
}
function isInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
async function readPetFolder(root, folderName, manifestName) {
    const folder = path.join(root, folderName);
    const manifest = (await safeReadJson(path.join(folder, manifestName)));
    if (!manifest || typeof manifest !== "object")
        return null;
    const spritesheetPath = typeof manifest.spritesheetPath === "string" ? manifest.spritesheetPath : "spritesheet.webp";
    const resolvedSpritesheet = path.resolve(folder, spritesheetPath);
    if (!isInside(folder, resolvedSpritesheet))
        return null;
    try {
        const image = await (0, image_info_1.getImageInfo)(resolvedSpritesheet);
        if (!image || image.width !== exports.ATLAS_WIDTH || image.height !== exports.ATLAS_HEIGHT)
            return null;
        return {
            id: folderName,
            displayName: manifest.displayName || manifest.id || folderName,
            description: manifest.description || null,
            folder,
            source: manifestName === "avatar.json" ? "avatar" : "pet",
            spritesheetPath: resolvedSpritesheet,
            spritesheetDataUrl: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`,
        };
    }
    catch {
        return null;
    }
}
async function readPets(codexHome) {
    const byId = new Map();
    for (const [root, manifest] of [
        [path.join(codexHome, "avatars"), "avatar.json"],
        [path.join(codexHome, "pets"), "pet.json"],
    ]) {
        let entries = [];
        try {
            entries = await fs.readdir(root, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const pet = await readPetFolder(root, entry.name, manifest);
            if (pet)
                byId.set(pet.id, pet);
        }
    }
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
