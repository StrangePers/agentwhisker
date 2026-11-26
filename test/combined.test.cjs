"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {createCombinedReader} = require("../src/main/providers/combined.cjs");
const snapshot = (state,id="same") => ({sessions:[{id,state,petState:state,updatedAt:new Date().toISOString()}]});
test("identical native IDs remain separate; waiting takes priority and clearing it resumes running", async () => {
    let opencode = snapshot("waiting");
    const read = createCombinedReader({codex:()=>snapshot("running"), opencode:()=>opencode});
    const both = await read({});
    assert.equal(both.petState, "waiting");
    assert.deepEqual(both.sessions.map(s=>s.id), ["opencode:same","codex:same"]);
    opencode = {sessions:[]};
    assert.equal((await read({})).active.id,"codex:same");
});
test("a delayed reader has at most one outstanding call and cannot hide fresh data", async () => {
    let complete, calls = 0;
    const read = createCombinedReader({codex:()=>snapshot("running"),opencode:()=>{
        calls++;
        if (calls > 1) throw Error("service offline");
        return new Promise(resolve=>{complete=resolve;});
    }},10);
    assert.deepEqual((await read({})).unavailable,["opencode"]);
    assert.equal((await read({})).state,"running");
    assert.equal(calls,1);
    complete(snapshot("waiting"));
    await new Promise(resolve=>setImmediate(resolve));
    const offline = await read({});
    assert.equal(offline.sessions.length,1);
    assert.equal(offline.offline,false);
});

test("an exact RoleShuttle task worktree groups workers while an independent session stays visible", async () => {
    const task = "0123456789abcdef".repeat(2);
    const parent = snapshot("running", task);
    parent.sessions.push({...parent.sessions[0]});
    const worker = snapshot("running", "worker");
    worker.sessions[0].directory = "D:/state/tasks/" + task + "/worktree/subdir";
    const independent = {...worker.sessions[0], id:"independent", directory:path.resolve("fixture-independent-checkout")};
    const read = createCombinedReader({
        roleshuttle: () => parent,
        codex: () => ({sessions:[...worker.sessions, independent]}),
        opencode: () => worker,
    });
    assert.deepEqual((await read({})).sessions.map(s => s.id).sort(), ["codex:independent", "roleshuttle:" + task]);
    parent.sessions = [];
    assert.equal((await read({})).sessions.length, 3);
});
test("agent checkboxes round-trip empty, legacy, single and arbitrary selections", () => {
    const {decode, encode} = require("../src/agent-selection");
    const {normalizeSettings} = require("../src/main/settings");
    for (const [old, expected] of [["desktop", []], ["codex-opencode", ["codex","opencode"]],
        ["roleshuttle", ["roleshuttle"]], ["agents:claude-code,roleshuttle", ["claude-code","roleshuttle"]]]) {
        assert.deepEqual(decode(old), expected);
        assert.deepEqual(decode(normalizeSettings({provider:encode(expected)}).provider), expected);
    }
});

test("Hybrid profile worktrees share one parent across bridges and preserve unrelated worktrees", async () => {
    const roleHome = path.resolve("test-hybrid-profile");
    const task = "0123456789abcdef".repeat(2);
    const stage = "rs-" + task;
    const tasks = [snapshot("running", task).sessions[0], snapshot("running", stage).sessions[0]];
    const worker = {...snapshot("running","child").sessions[0], directory:path.join(roleHome,"worktrees",task,"nested")};
    const independent = {...worker, id:"independent", directory:path.join(roleHome,"other","worktrees",task)};
    const read = createCombinedReader({
        roleshuttle: () => ({sessions:tasks}),
        "agent-console": () => snapshot("running",task),
        codex: () => ({sessions:[worker, independent]}),
        opencode: () => ({sessions:[worker]}),
    });
    assert.deepEqual((await read({roleHome})).sessions.map(s=>s.id).sort(),
        ["codex:independent", "roleshuttle:" + task, "roleshuttle:" + stage]);
});
