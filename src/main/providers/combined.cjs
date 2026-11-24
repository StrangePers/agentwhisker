"use strict";
const path = require("node:path");
const ranks = {waiting:0, failed:1, running:2, review:3, stale:4, unknown:4, idle:5};

// A slow source may finish after this poll. Its result is retained for the next one.
function createCombinedReader(readers, budgetMs = 450, source = "codex-opencode") {
    let previousActive;
    const slots = Object.entries(readers).map(([provider, read]) => ({provider, read}));
    return async options => {
        const work = slots.map(slot => {
            if (!slot.pending) {
                slot.pending = Promise.resolve().then(() => slot.read(options)).then(snapshot => {
                    slot.snapshot = snapshot;
                    slot.at = Date.now();
                }, () => { slot.snapshot = null; }).finally(() => { slot.pending = null; });
            }
            return slot.pending;
        });
        let timer;
        try {
            await Promise.race([Promise.all(work), new Promise(resolve => { timer = setTimeout(resolve, budgetMs); })]);
        } finally { clearTimeout(timer); }
        const unavailable = [], sessions = [];
        for (const {provider, snapshot, at} of slots) {
            if (!snapshot || snapshot.error || snapshot.offline || Date.now() - at > 30000) {
                unavailable.push(provider);
                continue;
            }
            const seen = new Set();
            for (const session of snapshot.sessions) {
                if (seen.has(session.id)) continue;
                seen.add(session.id);
                sessions.push({...session, origin:provider, sourceId:session.id, id:provider + ":" + session.id});
            }
        }
        // RoleShuttle allocates a worktree under tasks/<task_id>/worktree.
        // Only fold a worker when the bridge also reports that exact task ID.
        const parents = new Set(sessions.filter(s => ["roleshuttle", "agent-console"].includes(s.origin) && !["unknown", "stale"].includes(s.state)).map(s => s.sourceId));
        const visible = sessions.filter(session => {
            if (session.origin === "agent-console" && sessions.some(s => s.origin === "roleshuttle" && s.sourceId === session.sourceId && !["stale", "unknown"].includes(s.state))) return false;
            if (["roleshuttle", "agent-console"].includes(session.origin) || typeof session.directory !== "string") return true;
            if (options.roleHome && path.isAbsolute(session.directory)) {
                const relative = path.relative(path.join(options.roleHome, "worktrees"), session.directory);
                const localTask = relative.split(path.sep)[0];
                if (/^[0-9a-f]{32}$/.test(localTask) && parents.has(localTask)) return false;
            }
            const match = session.directory.replaceAll("\\", "/").match(/(?:^|\/)tasks\/([0-9a-f]{32})\/worktree(?:\/|$)/i);
            return !match || !parents.has(match[1].toLowerCase());
        });
        visible.sort((a,b) => (ranks[a.state] ?? ranks.unknown) - (ranks[b.state] ?? ranks.unknown) ||
            Number(b.id === previousActive) - Number(a.id === previousActive) ||
            Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        const active = visible[0] || null;
        previousActive = active?.id;
        return {source, active, sessions:visible, unavailable, offline:unavailable.length === slots.length,
            state:active?.state || "idle", petState:active?.petState || "idle", updatedAt:new Date().toISOString()};
    };
}
module.exports = {createCombinedReader};
