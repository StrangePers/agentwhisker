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

module.exports = {createLimitsSource};
