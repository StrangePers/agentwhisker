"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {_electron} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const {translator} = require("../src/locale");

async function run() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "aw-menu-"));
  const env = {...process.env, AGENTWHISKER_LIBRARY:path.join(profile,"library")};
  delete env.AGENT_CONSOLE_PET_PYTHON;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({executablePath:path.resolve(process.argv[2]),env,
    args:["--user-data-dir="+profile,"--provider=desktop"]});
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => typeof shape !== "undefined" && shape);
    const {t} = translator(await page.locator("html").getAttribute("lang"));
    await app.evaluate(({Menu}) => {
      const popup = Menu.prototype.popup;
      Menu.prototype.popup = function(options) {
        globalThis.testMenu = this;
        popup.call(this,options);
        setTimeout(() => this.closePopup(options.window),100);
      };
    });
    for (const available of [false,true]) {
      await page.evaluate(flag => window.codexPets.showConsoleMenu({panelOpen:false,limitsAvailable:flag}),available);
      const labels = await app.evaluate(() => globalThis.testMenu.items.filter(i => i.visible && i.label).map(i => i.label));
      assert.deepEqual(labels,[t("taskPanel"),...(available?[t("usageLimits")]:[]),t("quickSettings"),t("allSettings"),t("hideApp")]);
    }
    await app.evaluate((_,label) => globalThis.testMenu.items.find(i=>i.label===label).click(),t("quickSettings"));
    await page.locator("#allSettings").waitFor();
    await app.evaluate((_,label) => globalThis.testMenu.items.find(i=>i.label===label).click(),t("allSettings"));
    await page.waitForFunction(() => !document.querySelector("#preferencesStore").children.length);
    const full = app.windows().find(w => w !== page);
    await full.getByRole("button",{name:t("agents"),exact:true}).click();
    assert.equal(await full.locator('#agentChoices input[value="agent-console"]').count(),0);
    assert.equal(await full.locator('#agentChoices input[value="roleshuttle"]').count(),1);
    await app.evaluate(({Tray}) => {
      const assign = Tray.prototype.setContextMenu;
      Tray.prototype.setContextMenu = function(menu) {
        globalThis.testTray = menu;
        return assign.call(this,menu);
      };
    });
    await page.evaluate(() => window.codexPets.updateSettings({locale:document.documentElement.lang}));
    assert.deepEqual(await app.evaluate(() => globalThis.testTray.items.filter(i=>i.label).map(i=>i.label)),
      [t("showApp"),t("allSettings"),t("quitApp")]);
    await full.evaluate(() => window.close());
    await app.evaluate((_,label) => globalThis.testTray.items.find(i=>i.label===label).click(),t("allSettings"));
    await page.waitForFunction(() => !document.querySelector("#preferencesStore").children.length);
    assert.equal(app.windows().filter(w => w !== page && !w.isClosed()).length,1);
  } finally { await app.close(); }
}
run().catch(e=>{console.error(e);process.exitCode=1});
