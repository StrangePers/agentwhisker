"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
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
