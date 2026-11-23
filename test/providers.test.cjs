"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { classifySession, readCodexActivity } = require("../src/main/providers/codex");
const { normalizeClaudeSession, readQwenCodeActivity } = require("../src/main/providers/claude-code");
const { readOpenCodeActivity } = require("../src/main/providers/opencode");
const { readJsonStatusActivity } = require("../src/main/providers/json-status");

const now = new Date("2026-11-23T12:00:00Z");
const timestamp = now.toISOString();
const oldTime = new Date(+now - 60 * 60 * 1000).toISOString();
function codex(...payloads) {
  return classifySession({ id: "thread", updated_at: timestamp }, null, {
    mtimeMs: +now, records: payloads.map(payload => ({ payload, timestamp })),
  }, now).state;
}

test("Codex recognizes a completed tool invocation as activity within an open turn", () => {
  assert.equal(codex(
    { type: "task_started" },
    { type: "function_call", call_id: "read", status: "completed", name: "read_file" },
    { type: "function_call_output", call_id: "read" },
    { type: "item_completed" },
  ), "running");
  assert.equal(codex({ type: "task_started" }, { type: "error" }), "failed");
  assert.equal(codex({ type: "task_started" }, { type: "turn_aborted" }), "idle");
  assert.equal(codex({ type: "task_started" }, { type: "task_complete" }), "review");
});

test("Codex renders completion and expired activity in the idle pose", () => {
  const read = (type, minutes) => {
    const at = new Date(+now - minutes * 60_000).toISOString();
    return classifySession({id:"thread", updated_at:at}, null, {
      mtimeMs:Date.parse(at), records:[{payload:{type}, timestamp:at}],
    }, now);
  };
  for (const [type, minutes, state] of [["task_complete",2,"review"], ["task_started",2,"stale"], ["task_started",40,"idle"]]) {
    const session = read(type, minutes);
    assert.equal(session.state, state);
    assert.equal(session.petState, "idle");
  }
});

test("JSON reports unknown and stale states without hiding a healthy task", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),"aw-status-fallbacks-"));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const file = path.join(dir,"status.json");
  async function read(payload, options = {}) {
    await fs.writeFile(file, JSON.stringify(payload));
    return readJsonStatusActivity(file, {now,...options});
  }
  const live = await read({state:"provider_new",updatedAt:timestamp,items:[
    {state:"provider_new",id:"unknown"},
    {state:"running",id:"old",updatedAt:oldTime},
    {state:"running",id:"live"},
  ]});
  assert.equal(live.active.id,"live");
  assert.deepEqual(live.sessions.map(s=>[s.state,s.petState]),[
    ["unknown","idle"], ["stale","idle"], ["running","running"],
  ]);
  for (const state of ["review","inReview"]) {
    const done = await read({state,updatedAt:timestamp});
    assert.equal(done.state,"review");
    assert.equal(done.petState,"idle");
  }
  const managed = await read({state:"running",updatedAt:timestamp,items:[{state:"running",updatedAt:oldTime}]},{managed:true});
  assert.equal(managed.state,"running");
});

test("An expired or unfamiliar OpenCode bridge status uses a neutral pose", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),"aw-bridge-fallbacks-"));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const bridgeFile = path.join(dir,"status.json");
  for (const [state,updatedAt,expected] of [
    ["retrying_new",timestamp,"unknown"],
    ["waiting",new Date(+now-6*60_000).toISOString(),"stale"],
    ["review",timestamp,"review"],
  ]) {
    await fs.writeFile(bridgeFile,JSON.stringify({sessions:[{id:"test",state,updatedAt}]}));
    const activity = await readOpenCodeActivity({bridgeFile,runner:async()=>[],now});
    assert.equal(activity.state,expected);
    assert.equal(activity.petState,"idle");
  }
});

test("Codex waits on an unresolved request across bookkeeping and resumes after its result", () => {
  const start = { type: "task_started" };
  const ask = { type: "custom_tool_call", name: "functions.request_user_input", call_id: "ask", status: "completed" };
  const bookkeeping = { type: "item_completed" };
  assert.equal(codex(start, ask, bookkeeping), "waiting");
  assert.equal(codex(start, ask, bookkeeping, { type: "custom_tool_call_output", call_id: "ask" }), "running");
});

const file = { filePath: "profile/project/session.jsonl", stat: { mtimeMs: +now } };
function claude(...records) {
  return normalizeClaudeSession(file, records, now).state;
}

test("Claude Code follows turn records and ignores bookkeeping and superseded errors", () => {
  assert.equal(claude(
    { type: "assistant", timestamp: oldTime, isApiErrorMessage: true },
    { type: "user", timestamp, message: { content: "Test" } },
    { type: "api-request", timestamp },
    { type: "cost-state" },
  ), "running");
  assert.equal(claude(
    { type: "assistant", timestamp, message: { stop_reason: "end_turn", content: [{ type: "text" }] } },
    { type: "system", subtype: "turn_duration", timestamp },
    { type: "cost-state" },
  ), "review");
  assert.equal(claude({ type: "user", timestamp: oldTime, message: { content: "Test" } }), "idle");
});

test("Claude Code uses the actual pending tool and ignores sidechain turns", () => {
  const ask = { type: "assistant", timestamp, message: { stop_reason: "tool_use", content: [
    { type: "tool_use", name: "AskUserQuestion", id: "ask" },
  ] } };
  assert.equal(claude(ask, { type: "attachment" },
    { type: "assistant", isSidechain: true, message: { stop_reason: "end_turn" } }), "waiting");
  assert.equal(claude(ask, { type: "user", timestamp, message: { content: [
    { type: "tool_result", tool_use_id: "ask" },
  ] } }), "running");
});

test("Qwen Code reads top-level session journals and reports a missing source", async () => {
  const qwenHome = await fs.mkdtemp(path.join(os.tmpdir(), "aw-qwen-"));
  const project = path.join(qwenHome, "projects", "project");
  const subagents = path.join(project, "thread", "subagents");
  await fs.mkdir(subagents, { recursive: true });
  const assistant = stop_reason => JSON.stringify({ type: "assistant", timestamp, message: { stop_reason } });
  const session = path.join(project, "thread.jsonl");
  await fs.writeFile(session, assistant("tool_use") + "\n");
  await fs.writeFile(path.join(subagents, "worker.jsonl"), assistant("end_turn") + "\n");
  assert.equal((await readQwenCodeActivity({ qwenHome, now })).state, "running");
  await fs.appendFile(session, assistant("end_turn") + "\n");
  assert.equal((await readQwenCodeActivity({ qwenHome, now })).state, "review");
  assert.ok((await readQwenCodeActivity({ qwenHome: path.join(qwenHome, "missing"), now })).error);
});

test("OpenCode 2 reads its current database in read-only mode and distinguishes turn states", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aw-native-providers-"));
  const databasePath = path.join(dir, "opencode.db");
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE session_v2 (
    id TEXT, title TEXT, directory TEXT, project_id TEXT,
    time_created INTEGER, time_updated INTEGER, time_busy INTEGER, time_idle INTEGER, idle_outcome TEXT,
    time_archived INTEGER, parent_id TEXT
  )`);
  const insert = db.prepare("INSERT INTO session_v2 VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  insert.run("live", "Live job", dir, "project", +now - 2000, +now, +now - 1000, null, null, null, null);
  insert.run("done", "Finished job", dir, "project", +now - 2000, +now - 500, +now - 1000, +now - 500, "succeeded", null, null);
  insert.run("failed", "Failed job", dir, "project", +now - 2000, +now - 700, +now - 1000, +now - 700, "failed", null, null);
  insert.run("empty", "New session", dir, "project", +now - 1500, +now - 100, null, null, null, null, null);
  db.close();
  const activity = await readOpenCodeActivity({ databasePath, bridgeFile: path.join(dir, "no-bridge"), now });
  assert.equal(activity.state, "running");
  assert.deepEqual(Object.fromEntries(activity.sessions.map(s => [s.id, s.state])), {
    live: "running", done: "review", failed: "failed",
  });
  const offline = await readOpenCodeActivity({ databasePath: path.join(dir, "missing.db"), bridgeFile: path.join(dir, "no-bridge"), now });
  assert.equal(offline.state, "idle");
  assert.ok(offline.error);
});

test("OpenCode still reads the older session and message tables", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aw-opencode-legacy-"));
  const databasePath = path.join(dir, "opencode.db");
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE session (id TEXT, title TEXT, directory TEXT, project_id TEXT,
    time_created INTEGER, time_updated INTEGER, time_archived INTEGER);
    CREATE TABLE message (id TEXT, session_id TEXT, time_updated INTEGER, data TEXT);
    CREATE TABLE part (id TEXT, session_id TEXT, time_updated INTEGER, data TEXT);`);
  db.prepare("INSERT INTO session VALUES (?,?,?,?,?,?,NULL)").run("legacy", "Legacy session", dir, "project", +now, +now);
  db.prepare("INSERT INTO message VALUES (?,?,?,?)").run("message", "legacy", +now, JSON.stringify({ role: "assistant", finish: "stop" }));
  db.close();
  const activity = await readOpenCodeActivity({ databasePath, bridgeFile: path.join(dir, "no-bridge"), now });
  assert.equal(activity.state, "review");
});

test("a fork with inherited metadata stays visible alongside its parent", async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-fork-"));
  t.after(() => fs.rm(home, {recursive:true, force:true}));
  const dir = path.join(home, "sessions");
  await fs.mkdir(dir);
  const parent = "00000000-0000-0000-0000-000000000001";
  const child = "00000000-0000-0000-0000-000000000002";
  for (const [suffix, type] of [[parent, "task_complete"], [parent + "_" + child, "task_started"]]) {
    const records = [{type:"session_meta", payload:{id:parent}}, {timestamp, type:"event_msg", payload:{type}}];
    await fs.writeFile(path.join(dir, "rollout-" + suffix + ".jsonl"), records.map(r => JSON.stringify(r)).join("\n"));
  }
  const snapshot = await readCodexActivity(home, {now});
  assert.equal(snapshot.active.id, child);
  assert.deepEqual(Object.fromEntries(snapshot.sessions.map(s => [s.id, s.state])), {[parent]:"review", [child]:"running"});
});
