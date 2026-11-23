"use strict";
function createTaskAlerts() {
    let source = null;
    const states = new Map();
    function reset() {
        source = null;
        states.clear();
    }
    function observe(key, snapshot, managed) {
        if (source !== key) reset();
        const timestamp = Date.parse(snapshot.updatedAt);
        if (snapshot.error || snapshot.invalidState || snapshot.offline ||
            (managed && (!Number.isFinite(timestamp) || Date.now() - timestamp > 45000))) return [];
        const changes = [];
        for (const {id, state, title} of snapshot.sessions || []) {
            if (!id) continue;
            if (source === key && states.get(id) !== state && (state === "waiting" || state === "failed"))
                changes.push({title, state});
            states.delete(id);
            states.set(id, state);
        }
        while (states.size > 512) states.delete(states.keys().next().value);
        source = key;
        return changes;
    }
    return {reset, observe};
}
module.exports = {createTaskAlerts};
