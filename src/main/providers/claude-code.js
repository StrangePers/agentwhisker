"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { mapActivityToPetState } = require("./codex");
const { aggregateActivity, cleanString, findRecentFiles, readJsonlTail } = require("./shared");

const ACTIVE_MS = 90_000;
const WAITING_MS = 30 * 60_000;
const TERMINAL_MS = 20 * 60_000;
const INPUT_TOOLS = new Set(["askuserquestion", "askuser", "requestuserinput", "exitplanmode"]);
const TURN_END = new Set(["end_turn", "stop_sequence", "max_tokens", "stop", "completed"]);

function readClaudeCodeActivity(options = {}) {
    const home = options.claudeHome || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
    return readProjectActivity("claude-code", "Claude Code", home, options);
}

async function readQwenCodeActivity(options = {}) {
    const home = options.qwenHome || process.env.QWEN_HOME || path.join(os.homedir(), ".qwen");
    const runtime = process.env.QWEN_RUNTIME_DIR;
    if (!options.qwenHome && !options.projectsRoot && runtime && path.resolve(runtime) !== path.resolve(home)) {
        const activity = await readProjectActivity("qwen-code", "Qwen Code", runtime, options);
        if (!activity.error) return activity;
    }
    return readProjectActivity("qwen-code", "Qwen Code", home, options);
}

async function readProjectActivity(source, label, home, options) {
    const now = options.now || new Date();
    const root = path.resolve(options.projectsRoot || path.join(home, "projects"));
    if (!(await fs.stat(root).catch(() => null))?.isDirectory()) {
        return aggregateActivity(source, [], now, { error: label + " session directory is unavailable" });
    }
    const files = await findRecentFiles(root, (_file, name, directory) =>
        name.endsWith(".jsonl") && path.dirname(directory) === root, 8, 1);
    const sessions = await Promise.all(files.map(async file => {
        const records = await readJsonlTail(file.filePath);
        return normalizeClaudeSession(file, records, now, label);
    }));
    return aggregateActivity(source, sessions, now);
}

function normalizeClaudeSession(file, records, now, label = "Claude Code") {
    const { state, latest } = readConversation(records, file.stat.mtimeMs, now);
    const cwd = cleanString(latest?.cwd);
    const title = cwd ? path.basename(cwd) || cwd : path.basename(path.dirname(file.filePath));
    const latestEvent = state === "waiting" ? "User response needed" :
        state === "failed" ? "Agent reported an error" : latest?.type || label + " session activity";
    return {
        id: cleanString(latest?.sessionId) || path.basename(file.filePath, ".jsonl"),
        title: title || label + " session",
        detail: latestEvent,
        state,
        petState: mapActivityToPetState(state),
        updatedAt: cleanString(latest?.timestamp) || new Date(file.stat.mtimeMs).toISOString(),
        sessionPath: file.filePath,
        latestEvent,
    };
}

function readConversation(records, lastWrite, now) {
    let latest;
    let state = "idle";
    const pendingInput = new Set();
    for (const record of records) {
        if (!record || record.isSidechain || record.isMeta) continue;
        const blocks = Array.isArray(record.message?.content) ? record.message.content : [];
        if (record.type === "user") {
            const results = blocks.filter(block => block?.type === "tool_result");
            if (results.length) {
                for (const block of results) pendingInput.delete(block.tool_use_id || "");
            } else {
                pendingInput.clear();
            }
            state = "running";
        } else if (record.type === "assistant") {
            if (record.error || record.isApiErrorMessage) {
                pendingInput.clear();
                state = "failed";
            } else if (TURN_END.has(record.message?.stop_reason)) {
                pendingInput.clear();
                state = "review";
            } else {
                for (const block of blocks) {
                    const tool = typeof block?.name === "string" ? block.name.replace(/[^a-z]/gi, "").toLowerCase() : "";
                    if (block?.type === "tool_use" && INPUT_TOOLS.has(tool)) pendingInput.add(block.id || "");
                }
                state = "running";
            }
        } else if (record.type === "system" && record.subtype === "turn_duration") {
            pendingInput.clear();
            if (state !== "failed") state = "review";
        } else {
            continue;
        }
        latest = record;
    }
    if (state === "running" && pendingInput.size) state = "waiting";
    const timestamp = Date.parse(latest?.timestamp);
    const age = +now - (Number.isFinite(timestamp) ? timestamp : lastWrite);
    const lifetime = state === "waiting" ? WAITING_MS : state === "running" ? ACTIVE_MS : TERMINAL_MS;
    return { latest, state: age <= lifetime ? state : "idle" };
}

function normalizeClaudeState(record, updatedAt, now) {
    return readConversation([record], Date.parse(updatedAt), now).state;
}

module.exports = { readClaudeCodeActivity, readQwenCodeActivity, normalizeClaudeSession, normalizeClaudeState };
