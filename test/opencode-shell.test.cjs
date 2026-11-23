"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {readOpenCodeActivity} = require("../src/main/providers/opencode");

test("local shells respect location, session identity, input requests and process exit", async t => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aw-shell-registry-"));
    const other = path.join(temp, "other");
    let running = true, waiting = false;
    const session = {id:"session-a", title:"Check package", location:{directory:other}, time:{updated:Date.now()}};
    const server = http.createServer((req,res) => {
        const url = new URL(req.url,"http://localhost");
        const directory = url.searchParams.get("location[directory]") || temp;
        let data = [];
        if (url.pathname === "/api/session") data = [session];
        if (url.pathname === "/api/form" && directory === other && waiting) data = [{sessionID:session.id}];
        if (url.pathname === "/api/shell" && running) {
            const info = {cwd:directory,status:"running",time:{started:session.time.updated},command:"private command"};
            data = directory === other ? ["1","2"].map(id=>({...info,id,metadata:{sessionID:session.id}})) :
                [{...info,id:"standalone",metadata:{}}];
        }
        res.writeHead(200,{"content-type":"application/json"});
        res.end(JSON.stringify({location:{directory},data}));
    });
    await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(done=>server.close(done)); await fs.rm(temp,{recursive:true,force:true}); });
    const serviceFile = path.join(temp,"service.json");
    await fs.writeFile(serviceFile,JSON.stringify({url:"http://127.0.0.1:"+server.address().port,password:"test"}));
    const read = ()=>readOpenCodeActivity({serviceFile,bridgeFile:path.join(temp,"no-bridge")});
    const active = await read();
    assert.equal(active.sessions.length,2);
    assert.deepEqual(new Set(active.sessions.map(s=>s.id)),new Set(["shell:standalone",session.id]));
    assert(active.sessions.every(s=>s.state==="running"));
    assert(!JSON.stringify(active).includes("private command"));
    waiting = true;
    assert.equal((await read()).active.state,"waiting");
    waiting = running = false;
    assert.deepEqual((await read()).sessions,[]);
});
