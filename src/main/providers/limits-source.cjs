"use strict";

function createLimitsSource(load) {
    let snapshot = {providers:[]};
    let pending = false;
    return {
        read: () => snapshot,
        refresh() {
            if (pending) return true;
            pending = true;
            const requested_at = Date.now();
            snapshot = {...snapshot, error:null, refresh:{state:"running",requested_at}};
            void Promise.resolve().then(load).then(value => {
                snapshot = {...value, refresh:{state:"success",requested_at,completed_at:Date.now()}};
            }, () => {
                snapshot = {...snapshot, error:"limits_unavailable", refresh:{state:"error",requested_at,completed_at:Date.now()}};
            }).finally(() => { pending = false; });
            return true;
        },
    };
}

function combineLimits(snapshots) {
    if (snapshots.length < 2) return snapshots[0] || null;
    const refreshes = snapshots.map(s => s.refresh).filter(Boolean);
    const running = refreshes.some(r => r.state === "running");
    const failed = snapshots.every(s => s.refresh?.state === "error");
    const providers = snapshots.flatMap(s => (s.providers || []).map(p =>
        s.error ? {...p, status:"stale"} : p));
    return {
        providers,
        unavailableReasons:snapshots.map(s => s.unavailable).filter(Boolean),
        refresh:{
            state:running ? "running" : failed ? "error" : "success",
            requested_at:Math.max(0, ...refreshes.map(r => r.requested_at || 0)),
            completed_at:Math.max(0, ...refreshes.map(r => r.completed_at || 0)),
        },
    };
}

module.exports = {createLimitsSource, combineLimits};
