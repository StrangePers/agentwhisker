"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {createTaskAlerts} = require("../src/main/task-alerts.cjs");
const session = (id, state) => ({id, title:id, state});
test("alerts once per transition, including a task entering the list after the baseline", () => {
    const tracker = createTaskAlerts();
    const poll = (...sessions) => tracker.observe("file", {sessions});
    assert.deepEqual(poll(session("A","waiting")), []);
    assert.deepEqual(poll(), []);
    assert.deepEqual(poll(session("A","waiting"),session("B","failed")), [{title:"B",state:"failed"}]);
    assert.deepEqual(poll(session("B","failed"),session("A","running")), []);
    assert.deepEqual(poll(session("A","waiting")), [{title:"A",state:"waiting"}]);
});
test("ignores stale and invalid snapshots and silently establishes a new source or profile baseline", () => {
    const tracker = createTaskAlerts();
    const poll = (key,state,extra) => tracker.observe(key, {sessions:[session("A",state)], updatedAt:new Date().toISOString(), ...extra}, true);
    assert.deepEqual(poll("a","running"), []);
    for (const extra of [{updatedAt:"1970-01-01"}, {offline:true}, {error:"read"}, {invalidState:true}])
        assert.deepEqual(poll("a","failed",extra), []);
    assert.deepEqual(poll("a","failed"), [{title:"A",state:"failed"}]);
    assert.deepEqual(poll("b","waiting"), []);
    tracker.reset();
    assert.deepEqual(poll("b","failed"), []);
});
