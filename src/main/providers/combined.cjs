"use strict";
const ranks = {waiting:0, failed:1, running:2, review:3, stale:4, unknown:4, idle:5};

// A slow source may finish after this poll. Its result is retained for the next one.
function createCombinedReader(readers, budgetMs = 450) {
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
            for (const session of snapshot.sessions) {
                sessions.push({...session, origin:provider, sourceId:session.id, id:provider + ":" + session.id});
            }
        }
        sessions.sort((a,b) => (ranks[a.state] ?? ranks.unknown) - (ranks[b.state] ?? ranks.unknown) ||
            Number(b.id === previousActive) - Number(a.id === previousActive) ||
            Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        const active = sessions[0] || null;
        previousActive = active?.id;
        return {source:"codex-opencode", active, sessions, unavailable, offline:unavailable.length === slots.length,
            state:active?.state || "idle", petState:active?.petState || "idle", updatedAt:new Date().toISOString()};
    };
}
module.exports = {createCombinedReader};
