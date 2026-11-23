"use strict";

const assert = require("node:assert/strict");
const {execFile} = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {promisify} = require("node:util");
const {_electron} = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const exec = promisify(execFile);
const executablePath = path.resolve(process.argv[2]);

async function check(size) {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), "aw-x11-"));
    const env = {...process.env, AGENTWHISKER_LIBRARY:path.join(profile, "library")};
    delete env.AGENT_CONSOLE_PET_PYTHON;
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({executablePath, env, args:[`--user-data-dir=${profile}`, `--pet-size=${size}`]});
    try {
        const page = await app.firstWindow();
        await page.waitForFunction(() => typeof shape !== "undefined" && shape && limitsLayout && selectedPetId === "kitsu");
        await page.evaluate(() => {
            window.clickedPet = 0;
            petElement.addEventListener("mousedown", () => { window.clickedPet++; });
        });
        const newWindow = app.waitForEvent("window");
        const bounds = await app.evaluate(async ({BrowserWindow}) => {
            const win = BrowserWindow.getAllWindows()[0];
            win.setPosition(300, 180);
            const bounds = await new Promise(resolve => setTimeout(() => resolve(win.getContentBounds()), 250));
            const underlay = new BrowserWindow({...bounds, show:false, frame:false});
            await underlay.loadURL("data:text/html,<script>window.clicks=0;document.addEventListener('mousedown',()=>window.clicks++)</script>");
            underlay.showInactive();
            win.moveTop();
            return bounds;
        });
        const backdrop = await newWindow;
        const point = await page.evaluate(() => {
            const rect = petElement.getBoundingClientRect();
            for (const y of [.55,.65,.45]) {
                const p = {clientX:rect.left+rect.width/2, clientY:rect.top+rect.height*y};
                if (isPointInsideElement(p, petElement)) return p;
            }
            return null;
        });
        assert(point);
        const move = (x, y) => exec("xdotool", ["mousemove", String(Math.round(bounds.x+x)), String(Math.round(bounds.y+y))]);
        await move(12, 12);
        await page.waitForFunction(() => ignoringMouseEvents && lastPointer && lastPointer.clientX < 30 && lastPointer.clientY < 30);
        await exec("xdotool", ["click", "1"]);
        await backdrop.waitForFunction(() => window.clicks === 1);
        await move(point.clientX, point.clientY);
        await page.waitForFunction(() => !ignoringMouseEvents && lastPointer && isPointInsideElement(lastPointer, petElement));
        await exec("xdotool", ["click", "1"]);
        await page.waitForFunction(() => window.clickedPet === 1);
        assert.equal(await backdrop.evaluate(() => window.clicks), 1);
        await page.evaluate(() => setSettingsOpen(true));
        await page.waitForFunction(() => limitsLayout.settingsOpen && settingsPopover.offsetHeight > 480);
        await page.locator("#closeSettings").click();
        await page.waitForFunction(() => !limitsLayout.settingsOpen);
        console.log(`X11 ${size}: transparent background, first sprite click, and settings passed`);
    } finally { await app.close(); }
}

(async () => {
    for (const size of [160, 360]) await check(size);
})().catch(error => {console.error(error); process.exitCode = 1;});
