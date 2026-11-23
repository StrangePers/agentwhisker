"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeProvider = exports.PROVIDERS = void 0;
exports.readProviderActivity = readProviderActivity;
exports.listProviders = listProviders;
const claude_code_1 = require("./claude-code");
const codex_1 = require("./codex");
const desktop_1 = require("./desktop");
const json_status_1 = require("./json-status");
const opencode_1 = require("./opencode");
const registry_1 = require("./registry");
Object.defineProperty(exports, "normalizeProvider", { enumerable: true, get: function () { return registry_1.normalizeProvider; } });
const t3code_1 = require("./t3code");
const PROVIDER_READERS = {
    codex: (options) => (0, codex_1.readCodexActivity)(options.codexHome || "", options),
    opencode: opencode_1.readOpenCodeActivity,
    "claude-code": claude_code_1.readClaudeCodeActivity,
    t3code: t3code_1.readT3CodeActivity,
    "json-status": (options) => (0, json_status_1.readJsonStatusActivity)(options.statusFile, options),
    desktop: desktop_1.readDesktopActivity,
};
exports.PROVIDERS = [
    ...(0, registry_1.listProviderMetadata)().map((provider) => ({ ...provider, read: PROVIDER_READERS[provider.id] })),
];
const PROVIDER_BY_ID = new Map(exports.PROVIDERS.map((provider) => [provider.id, provider]));
async function readProviderActivity(options = {}) {
    const provider = PROVIDER_BY_ID.get(options.provider) || PROVIDER_BY_ID.get(options.statusFile ? "json-status" : "codex");
    if (!provider)
        throw new Error("Provider registry is empty");
    return provider.read(options);
}
function listProviders() {
    return (0, registry_1.listProviderMetadata)();
}
