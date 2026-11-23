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
exports.validatePetPackage = validatePetPackage;
const path = __importStar(require("node:path"));
const image_info_1 = require("./image-info");
const pet_store_1 = require("./pet-store");
async function validatePetPackage(packageDir) {
    const folder = path.resolve(packageDir);
    const manifestPath = path.join(folder, "pet.json");
    const result = {
        ok: false,
        packageDir: folder,
        manifestPath,
        checks: [],
    };
    const manifest = (await (0, pet_store_1.safeReadJson)(manifestPath));
    addCheck(result, "manifest", Boolean(manifest), manifest ? "pet.json parsed" : "pet.json missing or invalid JSON");
    if (!manifest)
        return result;
    addCheck(result, "id", typeof manifest.id === "string" && manifest.id.trim().length > 0, "id must be a non-empty string");
    addCheck(result, "displayName", typeof manifest.displayName === "string" && manifest.displayName.trim().length > 0, "displayName must be a non-empty string");
    addCheck(result, "description", !("description" in manifest) || typeof manifest.description === "string", "description must be a string when present");
    const spritesheetPath = typeof manifest.spritesheetPath === "string" ? manifest.spritesheetPath : "spritesheet.webp";
    const resolvedSpritesheet = path.resolve(folder, spritesheetPath);
    const relative = path.relative(folder, resolvedSpritesheet);
    const inside = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
    addCheck(result, "spritesheetPath", inside, "spritesheetPath must resolve inside the pet folder");
    if (!inside)
        return result;
    let image = null;
    try {
        image = await (0, image_info_1.getImageInfo)(resolvedSpritesheet);
    }
    catch {
        image = null;
    }
    addCheck(result, "spritesheet", Boolean(image), "spritesheet must be PNG or WebP");
    if (image) {
        result.spritesheet = {
            path: resolvedSpritesheet,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            columns: pet_store_1.ATLAS_COLUMNS,
            rows: pet_store_1.ATLAS_ROWS,
            cellWidth: pet_store_1.CELL_WIDTH,
            cellHeight: pet_store_1.CELL_HEIGHT,
        };
        addCheck(result, "dimensions", image.width === pet_store_1.ATLAS_WIDTH && image.height === pet_store_1.ATLAS_HEIGHT, `spritesheet must be ${pet_store_1.ATLAS_WIDTH}x${pet_store_1.ATLAS_HEIGHT}`);
    }
    result.ok = result.checks.every((check) => check.ok);
    return result;
}
function addCheck(result, name, ok, message) {
    result.checks.push({ name, ok, message });
}
