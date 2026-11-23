"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { translator, languages } = require("../src/locale");

async function main() {
  const exe = path.resolve(process.argv[2] || "dist/AgentWhisker-win32-x64/AgentWhisker.exe");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "agentwhisker-locales-"));
  const profile = path.join(temp, "profile");
  const status = path.join(temp, "status.json");
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, "settings.json"), JSON.stringify({
    petSize: 160, idleAnimationMode: "events-only",
  }));
  const task = { id: "a".repeat(32), state: "running", title: "Build the release" };
  await fs.writeFile(status, JSON.stringify({ ...task, items: [task] }));
  const env = { ...process.env, AGENTWHISKER_LIBRARY: path.join(temp, "library") };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.AGENT_CONSOLE_PET_PYTHON;
  const launch = () => _electron.launch({ executablePath: exe, env, args: [
    "--user-data-dir=" + profile, "--status-file=" + status,
  ] });
  const awaitLocale = (page, code) => page.waitForFunction(expected => document.documentElement.lang === expected &&
    providerById.has("json-status") && currentState === "running" &&
    !document.getElementById("languageSelect").disabled, code);
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await app.evaluate(({ Menu, dialog }) => {
      globalThis.awTrayLabels = [];
      const makeMenu = Menu.buildFromTemplate.bind(Menu);
      Menu.buildFromTemplate = template => {
        if (template.length === 4) globalThis.awTrayLabels = template.filter(item => item.label).map(item => item.label);
        return makeMenu(template);
      };
      dialog.showOpenDialog = async (_window, options) => {
        globalThis.awPicker = options;
        return { canceled: true, filePaths: [] };
      };
    });
    await page.locator("#languageSelect").locator("option").first().waitFor({ state: "attached" });
    const initial = await page.locator("html").getAttribute("lang");
    assert(Object.hasOwn(languages, initial));
    assert.equal(await page.locator("#languageSelect").inputValue(), "");
    await page.evaluate(() => setSettingsOpen(true));
    await page.locator("#petSizeInput").evaluate(input => {
      input.value = "360";
      for (const type of ["input", "change"]) input.dispatchEvent(new Event(type, { bubbles: true }));
    });
    await page.waitForFunction(() => petSize === 360);
    for (const code of ["es", "zh-CN", "hi", "en"]) {
      const { t, taskCount } = translator(code);
      await page.evaluate(() => setSettingsOpen(true));
      await page.locator("#languageSelect").selectOption(code);
      await awaitLocale(page, code);
      assert.equal(await page.locator('label[for="languageSelect"]').textContent(), t("language"));
      assert.equal(await page.locator('label[for="idleAnimationMode"]').textContent(), t("idleAnimation"));
      assert.equal(await page.locator("#idleAnimationMode").inputValue(), "events-only");
      assert.equal(await page.locator("#petSizeInput").inputValue(), "360");
      assert.equal(await page.locator("#statusFileInput").inputValue(), status);
      assert.equal(await page.locator("#taskCount").textContent(), taskCount(1));
      assert.equal(await page.locator(".session-title").first().textContent(), task.title);
      assert.deepEqual(
        await app.evaluate(() => globalThis.awTrayLabels), [t("showApp"), t("hideApp"), t("quitApp")]);
      await page.evaluate(() => window.codexPets.importPet());
      const picker = await app.evaluate(() => globalThis.awPicker);
      assert.equal(picker.title, t("installCharacter"));
      assert.equal(picker.filters[0].name, t("packFilter"));
    }
    await page.locator("#languageSelect").selectOption("zh-CN");
    await awaitLocale(page, "zh-CN");
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await awaitLocale(page, "zh-CN");
    assert.equal(await page.locator("#languageSelect").inputValue(), "zh-CN");
    assert.equal(await page.locator("#petSizeInput").inputValue(), "360");
    assert.equal(await page.locator("#idleAnimationMode").inputValue(), "events-only");
    console.log("Four application languages, translated tray and picker, plural label, source title, and persistence");
  } finally { await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
