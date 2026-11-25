"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {_electron} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function run(count, size) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "agentwhisker-connect-"));
    const profile = path.join(root, "profile");
    const env = {...process.env, CODEX_HOME:root, CLAUDE_CONFIG_DIR:root, QWEN_HOME:path.join(root,"qwen"),
        XDG_DATA_HOME:root, XDG_STATE_HOME:root, QWEN_RUNTIME_DIR:"", PATH:root,
        AGENTWHISKER_LIBRARY:path.join(root,"library")};
    delete env.Path;
    env.PATH = root;
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.AGENT_CONSOLE_PET_PYTHON;
    for (const name of ["claude","qwen"].slice(0,count))
        await fs.writeFile(path.join(root, name + (process.platform === "win32" ? ".cmd" : "")), "", {mode:0o755});
    const launch = () => _electron.launch({executablePath:path.resolve(process.argv[2]),env,
        args:["--user-data-dir="+profile,"--pet-size="+size]});
    let app = await launch();
    try {
        const page = await app.firstWindow();
        await page.waitForFunction(() => !preferenceNode("firstConnection").hidden &&
            preferenceNode("discoveryMessage").textContent !== t("findingAgents"));
        const full = app.windows().find(window => window !== page);
        assert.equal(await full.locator("#detectedAgents button").count(), count);
        if (!count) {
            await full.click("#keepDesktop");
            await page.waitForFunction(() => !settingsOpen);
        } else {
            await full.locator("#detectedAgents button").first().click();
            await page.waitForFunction(() => provider === "claude-code" &&
                preferenceNode("sourceDiagnostic").textContent === t("startSession"));
            const project = path.join(root,"projects","sample");
            await fs.mkdir(project,{recursive:true});
            await fs.writeFile(path.join(project,"session.jsonl"), JSON.stringify({type:"user",
                sessionId:"sample", timestamp:new Date().toISOString(), message:{content:"Sample"}}));
            await full.locator("#connectionDiagnostic").evaluate(details => {details.open = true;});
            await full.click("#retrySource");
            await page.waitForFunction(() => currentState === "running");
            await fs.rename(path.join(root,"projects"),path.join(root,"saved-projects"));
            await page.evaluate(() => refreshActivity());
            await page.waitForFunction(() => preferenceNode("retrySource").hidden === false);
            await fs.rename(path.join(root,"saved-projects"),path.join(root,"projects"));
            await full.click("#retrySource");
            await page.waitForFunction(() => currentState === "running");
        }
        await app.close();
        app = await launch();
        const page2 = await app.firstWindow();
        await page2.waitForFunction(() => !!document.querySelector("#liveStatus").textContent);
        assert(await page2.locator("#firstConnection").isHidden());
        assert.equal(await page2.evaluate(() => provider), count ? "claude-code" : "desktop");
        if (!count) {
            const status = path.join(root,"status.json");
            await fs.writeFile(status, JSON.stringify({state:"waiting",title:"Example"}));
            await page2.evaluate(() => openPreferences("agents"));
            const full2 = app.windows().find(window => window !== page2);
            await full2.locator("#connectionOptions").evaluate(details => {details.open = true;});
            await full2.check('#agentChoices input[value="json-status"]');
            await app.evaluate(({dialog}, file) => {
                dialog.showOpenDialog = async () => ({canceled:false,filePaths:[file]});
            },status);
            await full2.click("#chooseStatusFile");
            await page2.waitForFunction(() => currentState === "waiting");
            assert.equal(await full2.locator("#statusFileInput").inputValue(),status);
        }
        console.log(count, "detected agents at", size, "and persisted choice");
    } finally {await app.close();}
}
(async () => {
    for (const [count,size] of [[0,160],[1,160],[2,360]]) await run(count,size);
})().catch(error => {console.error(error);process.exitCode=1;});
