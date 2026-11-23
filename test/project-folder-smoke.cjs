"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {_electron} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function check(size) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(),"aw-project-"));
    const sessions = path.join(root,"sessions");
    await fs.mkdir(sessions);
    const ids = ["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"];
    const folders = [path.join(root,"first project"),path.join(root,"second project")];
    function line(type,payload) {
        return JSON.stringify({type,payload,timestamp:new Date().toISOString()}) + "\n";
    }
    for (const [index,id] of ids.entries()) {
        await fs.mkdir(folders[index]);
        await fs.writeFile(path.join(sessions,id+".jsonl"),line("session_meta",{id,cwd:folders[index]})+
            line("event_msg",{type:"task_started"}));
    }
    const env = {...process.env,CODEX_HOME:root,AGENTWHISKER_LIBRARY:path.join(root,"library")};
    delete env.AGENT_CONSOLE_PET_PYTHON;
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({executablePath:path.resolve(process.argv[2]),env,
        args:["--user-data-dir="+path.join(root,"profile"),"--provider=codex","--pet-size="+size]});
    try {
        const page = await app.firstWindow();
        page.setDefaultTimeout(15000);
        await page.waitForFunction(() => shape && currentState === "running" && threadBadge.textContent === "2");
        await app.evaluate(({shell}) => {
            globalThis.openedFolders = [];
            shell.openPath = async folder => { globalThis.openedFolders.push(folder); return ""; };
        });
        await page.locator("#threadBadge").click();
        for (const [index,id] of ids.entries()) {
            await page.locator('[data-task-id="'+id+'"]').click();
            await app.evaluate(async (_electron, count) => {
                const end = Date.now() + 10000;
                while (globalThis.openedFolders.length < count && Date.now() < end)
                    await new Promise(resolve=>setTimeout(resolve,50));
            },index+1);
        }
        assert.deepEqual(await app.evaluate(() => globalThis.openedFolders),folders);

        await fs.rename(folders[1],folders[1]+"-moved");
        assert.equal(await page.evaluate(id=>window.codexPets.openProjectFolder(id),ids[1]),false);
        await fs.appendFile(path.join(sessions,ids[0]+".jsonl"),line("event_msg",{type:"task_complete"}));
        assert.equal(await page.evaluate(id=>window.codexPets.openProjectFolder(id),ids[0]),false);
        await page.evaluate(()=>refreshActivity());
        await page.waitForFunction(()=>!document.querySelector("button.session-item"));
        assert.equal(await app.evaluate(()=>globalThis.openedFolders.length),2);
        console.log("Codex row routing, missing folder and completed task passed at",size);
    } finally { await app.close(); }
}
(async()=>{for(const size of [160,360]) await check(size);})().catch(error=>{console.error(error);process.exitCode=1;});
