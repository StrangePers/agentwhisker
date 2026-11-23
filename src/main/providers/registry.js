"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVIDER_METADATA = void 0;
exports.listProviderMetadata = listProviderMetadata;
exports.getProviderMetadata = getProviderMetadata;
exports.normalizeProvider = normalizeProvider;
exports.PROVIDER_METADATA = [
    {
        id: "codex",
        label: "Codex",
        modes: ["jsonl"],
        defaultRefreshMs: 8000,
        setupHint: "Reads local Codex session metadata from CODEX_HOME.",
    },
    {
        id: "opencode",
        label: "OpenCode",
        modes: ["bridge-file", "command"],
        defaultRefreshMs: 8000,
        setupHint: "Install the OpenCode plugin for realtime status, with CLI fallback for recent sessions.",
    },
    {
        id: "claude-code",
        label: "Claude Code",
        modes: ["jsonl"],
        defaultRefreshMs: 8000,
        setupHint: "Reads local Claude Code project transcripts without exposing prompt or response text.",
    },
    {
        id: "t3code",
        label: "T3Code",
        modes: ["command", "jsonl"],
        defaultRefreshMs: 8000,
        setupHint: "Uses T3Code session commands first, with local read-only app-data fallback.",
    },
    {
        id: "json-status",
        label: "Status file",
        modes: ["bridge-file"],
        requiresStatusFile: true,
        defaultRefreshMs: 8000,
        setupHint: "Reads a privacy-safe JSON status snapshot written by a hook, wrapper, or script.",
    },
    {
        id: "desktop",
        label: "Desktop",
        modes: ["manual"],
        defaultRefreshMs: 30000,
        setupHint: "Manual idle companion mode.",
    },
];
const PROVIDER_BY_ID = new Map(exports.PROVIDER_METADATA.map((provider) => [provider.id, provider]));
function listProviderMetadata() {
    return exports.PROVIDER_METADATA.map((provider) => ({ ...provider, modes: [...provider.modes] }));
}
function getProviderMetadata(id) {
    const provider = PROVIDER_BY_ID.get(id);
    return provider ? { ...provider, modes: [...provider.modes] } : undefined;
}
function normalizeProvider(value) {
    return PROVIDER_BY_ID.has(value) ? value : "codex";
}
