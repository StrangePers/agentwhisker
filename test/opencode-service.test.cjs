"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {connectOpenCodeService} = require("../src/main/providers/opencode-service.cjs");

test("OpenCode requests preserve loopback scope, statuses and a deadline covering the body", async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aw-http-test-"));
    const file = path.join(dir, "service.json");
    const seen = [];
    const server = http.createServer((req, res) => {
        seen.push({url:req.url, authorization:req.headers.authorization});
        switch (req.url) {
            case "/ok?q=x":
                res.end(JSON.stringify({data:"Kitsu — 日本語"}));
                break;
            case "/redirect":
                res.writeHead(302, {Location:"/ok?q=x"}).end();
                break;
            case "/slow":
                res.writeHead(200).write('{"unfinished":');
                break;
            case "/oversize":
                res.end(Buffer.alloc(16 * 1024 * 1024 + 1));
                break;
            case "/bad-json":
                res.end("{");
                break;
            default:
                res.writeHead(404).end();
        }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await fs.rm(dir,{recursive:true,force:true});
    });
    await fs.writeFile(file, JSON.stringify({url:"http://127.0.0.1:"+server.address().port,password:"test"}));
    const get = await connectOpenCodeService(file);
    assert.deepEqual(await (await get("/ok?q=x")).json(), {data:"Kitsu — 日本語"});
    assert.equal(seen[0].authorization, "Basic "+Buffer.from("opencode:test").toString("base64"));
    assert.equal((await get("/missing")).status, 404);
    await assert.rejects(get("http://localhost:"+server.address().port+"/ok?q=x"), /Invalid OpenCode route/);
    await assert.rejects(get("/redirect"), /redirect/);
    assert.equal(seen.filter(x => x.url === "/ok?q=x").length, 1);
    await assert.rejects(get("/slow", 120), {name:"AbortError"});
    await assert.rejects(get("/oversize"), /too large/);
    await assert.rejects((await get("/bad-json")).json(), SyntaxError);
});
