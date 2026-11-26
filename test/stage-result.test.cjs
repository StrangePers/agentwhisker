const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {readStageResult, resultPage} = require("../src/main/stage-result.cjs");

test("opens only the matching standalone receipt and displays it as text", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "whisker-stage-"));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const status = path.join(root, "agentwhisker-status.json");
    const id = "rs-" + "a".repeat(32);
    const result = '<script>alert("example")</script> & result';
    await fs.mkdir(path.join(root, "stages"));
    const target = path.join(root, "stages", id + ".json");
    await fs.writeFile(target, JSON.stringify({id, state: "review", receipt: {result}}));
    assert.equal(await readStageResult(status, id), result);
    await assert.rejects(readStageResult(status, "../receipt"));
    await assert.rejects(readStageResult(status, "a".repeat(32)));
    const html = decodeURIComponent(resultPage("RoleShuttle result", result).split(",")[1]);
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<script>"));
    await fs.writeFile(target, JSON.stringify({id, state: "running", receipt: {result}}));
    await assert.rejects(readStageResult(status, id));
});
