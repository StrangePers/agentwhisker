"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {execFileSync, spawn} = require("node:child_process");
const {once} = require("node:events");
const {_electron} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function main() {
    const exe = path.resolve(process.argv[2]);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aw-daily-"));
    const profile = path.join(tmp, "login"), status = path.join(tmp, "status.json");
    const env = {...process.env, AGENTWHISKER_LIBRARY:path.join(tmp, "library")};
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.AGENT_CONSOLE_PET_PYTHON;
    const args = ["--user-data-dir=" + profile, "--status-file=" + status, "--login-start"];
    async function snapshot(state) {
        await fs.writeFile(status + ".tmp", JSON.stringify({state, items:[{id:"smoke",title:"AgentWhisker test",state}]}));
        await fs.rename(status + ".tmp", status);
    }
    await snapshot("waiting");
    let login = await _electron.launch({executablePath:exe, env, args});
    let managed, duplicate;
    try {
        const page = await login.firstWindow();
        await page.waitForFunction(() => typeof shape !== "undefined" && shape && !document.getElementById("windowsSettings").hidden);
        await page.evaluate(() => setSettingsOpen(true));
        const name = "AgentWhisker-Test-" + path.basename(tmp);
        await login.evaluate(({app, Tray}, name) => {
            const set = app.setLoginItemSettings.bind(app);
            app.setLoginItemSettings = options => set({...options, name});
            const get = app.getLoginItemSettings.bind(app);
            app.getLoginItemSettings = options => {
                const result = get(options);
                result.launchItems = result.launchItems.filter(item => item.name === name)
                    .map(item => ({...item, name:"AgentWhisker"}));
                return result;
            };
            globalThis.smokeBalloons = [];
            const show = Tray.prototype.displayBalloon;
            Tray.prototype.displayBalloon = function(options) {
                globalThis.smokeBalloons.push(options);
                return show.call(this, options);
            };
        }, name);
        const loginToggle = page.locator("#loginToggle");
        const regKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        try {
            assert.equal(await loginToggle.isChecked(), false);
            await loginToggle.click();
            await page.waitForFunction(() => !document.getElementById("loginToggle").disabled);
            const registration = execFileSync("reg.exe", ["query",regKey,"/v",name], {encoding:"utf8", windowsHide:true});
            const registrationState = await login.evaluate(({app}) => app.getLoginItemSettings({path:process.execPath,args:["--login-start"]}));
            assert(registration.toLowerCase().includes(exe.toLowerCase()) && registration.includes("--login-start"));
            assert.equal(await loginToggle.isChecked(), true, JSON.stringify(registrationState));
            await loginToggle.uncheck();
            await page.waitForFunction(() => !document.getElementById("loginToggle").disabled);
            assert.throws(() => execFileSync("reg.exe", ["query",regKey,"/v",name], {stdio:"ignore",windowsHide:true}));
        } finally { await page.evaluate(() => window.codexPets.setLoginSetting(false)); }
        const toggle = page.locator("#attentionToggle");
        assert.equal(await toggle.isChecked(), false);
        await toggle.check();
        await page.waitForFunction(() => !document.getElementById("attentionToggle").disabled);
        const poll = () => page.evaluate(() => window.codexPets.readActivity({provider,codexHome,statusFile}));
        await poll();
        await snapshot("running"); await poll();
        await snapshot("waiting"); await poll(); await poll();
        await snapshot("failed"); await poll(); await poll();
        const balloons = await login.evaluate(() => globalThis.smokeBalloons);
        assert.equal(balloons.length, 2);
        assert(balloons.every(b => b.noSound && b.respectQuietTime && b.content.includes("AgentWhisker test")));
        assert.equal(JSON.parse(await fs.readFile(path.join(profile, "settings.json"))).notifyOnAttention, true);
        await toggle.uncheck();
        await page.waitForFunction(() => !document.getElementById("attentionToggle").disabled);
        await snapshot("running"); await poll();
        await snapshot("failed"); await poll();
        assert.equal(await login.evaluate(() => globalThis.smokeBalloons.length), 2);
        console.log("Windows Run registration enabled/removed. Windows tray accepted two quiet alerts for two transitions.");

        const runtime = JSON.parse(await fs.readFile(path.join(os.homedir(), ".local/share/agent-console/runtime.json")));
        const bridge = path.join(tmp,"bridge.json");
        const closing = once(login.process(), "exit", {signal:AbortSignal.timeout(45000)});
        const launchManaged = () => _electron.launch({executablePath:exe,
            env:{...env, AGENT_CONSOLE_PET_PYTHON:runtime.python,PYTHONPATH:path.join(runtime.source_root,"src")},
            args:["--user-data-dir="+path.join(tmp,"console"),"--status-file="+bridge]});
        managed = await launchManaged();
        await closing;
        login = null;
        const consolePage = await managed.firstWindow();
        await consolePage.waitForFunction(() => typeof shape !== "undefined" && managed && shape && document.querySelector("#liveStatus").dataset.offline === "false");
        assert(Array.isArray(JSON.parse(await fs.readFile(bridge)).items));
        duplicate = spawn(exe, args, {env,windowsHide:true,stdio:"ignore"});
        const [code] = await once(duplicate, "exit", {signal:AbortSignal.timeout(30000)});
        assert.equal(code, 0);
        assert.equal(managed.windows().length, 1);
        console.log("Both launch orders left the managed Kitsu window with a connected Console bridge.");
        await managed.close();
        managed = null;
        const starting = launchManaged();
        duplicate = spawn(exe, args, {env,windowsHide:true,stdio:"ignore"});
        const exited = once(duplicate, "exit", {signal:AbortSignal.timeout(30000)});
        managed = await starting;
        assert.equal((await exited)[0], 0);
        const remaining = await managed.firstWindow();
        await remaining.waitForFunction(() => typeof shape !== "undefined" && shape && managed);
        console.log("Concurrent launches also left one managed pet.");
    } finally {
        if (duplicate && duplicate.exitCode === null) duplicate.kill();
        if (managed) await managed.close();
        if (login && login.process().exitCode === null) await login.close();
    }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
