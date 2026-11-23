const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "agentwhisker-tasks-"));
  const status = path.join(temp, "status.json");
  const profile = path.join(temp, "profile");
  const env = { ...process.env, AGENTWHISKER_LIBRARY: path.join(temp, "library") };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.AGENT_CONSOLE_PET_PYTHON;
  const running = [
    { id: "a".repeat(32), state: "running", title: "Correct README guidance for renewing a Console browser session", detail: "Agent Console" },
    { id: "b".repeat(32), state: "running", title: "Isolated Windows Rust/Tauri Kitsu prototype", detail: "AgentWhisker" },
  ];
  const waiting = { id: "c".repeat(32), state: "waiting", title: "Choose target", detail: "Which target should I use?" };
  const history = { state: "idle", title: "Already finished" };
  const publish = (items, offline = false) => fs.writeFile(status, JSON.stringify({
    state: items[0]?.state || "idle", items, offline,
  }));
  await publish([...running, history]);
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, "settings.json"), JSON.stringify({ locale: "en" }));
  await fs.writeFile(path.join(profile, "limits.json"), JSON.stringify({
    providers: Array.from({length: 6}, (_, index) => ({
      id: `provider-${index}`, label: `Provider ${index}`, windows: [],
    })),
  }));
  const app = await _electron.launch({
    executablePath: path.resolve(process.argv[2] || "dist/AgentWhisker-win32-x64/AgentWhisker.exe"),
    env, args: [...(process.argv[3] ? [path.resolve(process.argv[3])] : []), "--user-data-dir=" + profile, "--status-file=" + status],
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const badge = page.locator("#threadBadge");
    const panel = page.locator("#threadPopover");
    const rows = panel.locator(".session-title");
    const collapse = page.getByRole("button", { name: "Collapse tasks" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await badge.waitFor({ state: "attached" });
    await page.waitForFunction(() => shape && currentState === "running");
    await badge.waitFor({ state: "visible" });
    assert.equal(await badge.textContent(), "2");
    await badge.click();
    assert.deepEqual(await rows.allTextContents(), running.map(task => task.title));
    assert.equal(await badge.isVisible(), false);
    assert.equal(await collapse.evaluate(button => button.offsetHeight), 38);
    assert.equal(await collapse.locator(".thread-close").count(), 1);
    assert.equal(await collapse.evaluate(button => button.matches(":focus-visible")), false);
    const firstTask = panel.locator("button.session-item").first();
    const rowHeights = await panel.locator(".session-item").evaluateAll(items =>
      items.map(item => item.offsetHeight));
    assert.deepEqual(rowHeights, [68, 51]);
    const geometry = await panel.evaluate(async node => {
      const original = node.offsetHeight;
      node.style.height = `${original + 35}px`;
      const reads = [];
      for (let index = 0; index < 5; index++) {
        positionLimits();
        await new Promise(requestAnimationFrame);
        reads.push(node.offsetHeight);
      }
      return {original, reads};
    });
    assert.ok(geometry.reads.every(height => height === geometry.original), JSON.stringify(geometry));
    assert.equal(await panel.evaluate(node => getComputedStyle(node).transform), "none");
    for (let update = 0; update < 3; update++) {
      await page.evaluate(() => refreshActivity());
      assert.equal(await panel.evaluate(node => node.offsetHeight), geometry.original);
    }
    await firstTask.hover();
    const rowPaint = await firstTask.evaluate(row => {
      const bounds = row.getBoundingClientRect();
      const content = row.closest(".thread-content");
      const left = content.getBoundingClientRect().left;
      const centerY = bounds.top + bounds.height / 2;
      return {
        fullWidth: row.contains(document.elementFromPoint(left + 2, centerY)) &&
          row.contains(document.elementFromPoint(left + content.clientWidth - 2, centerY)),
        hover: getComputedStyle(row).backgroundColor,
      };
    });
    assert.ok(rowPaint.fullWidth && rowPaint.hover !== "rgba(0, 0, 0, 0)", JSON.stringify(rowPaint));
    const hint = panel.locator(".thread-hint");
    await hint.waitFor({ state: "attached", timeout: 2000 });
    assert.equal(await hint.isVisible(), false);
    await page.waitForFunction(() => !document.getElementById("threadPopover").getAnimations().length);
    await page.mouse.move(1, 1);
    await collapse.hover();
    await hint.waitFor({ state: "visible" });
    assert.equal(await hint.textContent(), "Collapse tasks");
    assert.equal(await collapse.evaluate(button => button.matches(":focus-visible")), false);
    await page.mouse.move(1, 1);
    await hint.waitFor({ state: "hidden" });
    await collapse.press("Escape");
    await badge.waitFor({ state: "visible" });
    assert.equal(await badge.evaluate(button => button === document.activeElement), true);
    await badge.press("Enter");
    assert.equal(await collapse.evaluate(button => button.matches(":focus-visible")), true);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const animated = await panel.evaluate(async (node, sessions) => {
      const render = items => renderActivity({source:"json-status", active:items[0], sessions:items, state:"running"});
      render(sessions);
      const before = node.getBoundingClientRect();
      const expanded = [...sessions, {id:"d".repeat(32), state:"running", title:"Additional task"}];
      render(expanded);
      const resize = node.getAnimations().find(animation => animation.id === "thread-resize");
      if (!resize) return null;
      resize.pause();
      await resize.ready;
      resize.currentTime = resize.effect.getTiming().duration / 2;
      const middle = node.getBoundingClientRect();
      render(expanded);
      const same = node.getAnimations().includes(resize);
      resize.finish();
      const after = node.getBoundingClientRect();
      render(sessions);
      const shrink = node.getAnimations().find(animation => animation.id === "thread-resize");
      shrink?.finish();
      return {before:before.height, middle:middle.height, after:after.height, same, shrinks:Boolean(shrink),
        anchored:Math.abs(before.bottom - middle.bottom) <= 1 && Math.abs(before.bottom - after.bottom) <= 1};
    }, running);
    assert.ok(animated && animated.before < animated.middle && animated.middle < animated.after,
      JSON.stringify(animated));
    assert.ok(animated.same && animated.shrinks && animated.anchored, JSON.stringify(animated));
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await panel.evaluate((node, sessions) => {
      const render = items => renderActivity({source:"json-status", active:items[0], sessions:items, state:"running"});
      render([...sessions, {id:"d".repeat(32), state:"running", title:"Additional task"}]);
      const resizing = node.getAnimations().some(animation => animation.id === "thread-resize");
      render(sessions);
      return resizing;
    }, running), false);

    const content = panel.locator(".thread-content");
    const petStage = page.locator(".pet-stage");
    const originalTask = rows.first();
    for (const size of [160, 360]) {
      await page.evaluate(size => applyPetSize(size), size);
      for (const state of ["idle", "running"]) {
        await page.evaluate(async state => { requestedState = state; setState(state); await updatePetShape(state); }, state);
        await page.waitForFunction(state => currentState === state && shape?.height, state);
        const bubbleRect = await panel.boundingBox();
        const petRect = await petStage.boundingBox();
        assert.ok(bubbleRect.y + bubbleRect.height <= petRect.y ||
          bubbleRect.x + bubbleRect.width <= petRect.x || petRect.x + petRect.width <= bubbleRect.x,
        `Bubble overlaps ${state} at ${size}`);
        assert.equal(await panel.evaluate(node => node.classList.contains("has-trail")), true);
        const trail = await panel.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const anchors = positionPetActions(layoutRectInApp(petStage));
          const dot = pseudo => {
            const style = getComputedStyle(node, pseudo);
            return {
              x: rect.left + node.clientLeft + parseFloat(style.left),
              y: rect.top + node.clientTop + parseFloat(style.top),
              radius: parseFloat(style.width) / 2,
            };
          };
          const near = dot("::before");
          const far = dot("::after");
          const distance = point => Math.hypot(point.x - anchors.headX, point.y - anchors.headY);
          const clearsSprite = point => {
            for (let offset = -point.radius; offset <= point.radius; offset++) {
              const row = Math.floor(shape.top + (point.y + offset - petStage.offsetTop) / spriteScale);
              if (!shape.rightByRow[row]) continue;
              const spriteLeft = petStage.getBoundingClientRect().left + (shape.leftByRow[row] - shape.left) * spriteScale;
              const spriteRight = petStage.getBoundingClientRect().left + (shape.rightByRow[row] - shape.left) * spriteScale;
              if (point.x + point.radius > spriteLeft && point.x - point.radius < spriteRight) return false;
            }
            return true;
          };
          return {
            separation: Math.hypot(near.x - far.x, near.y - far.y) - near.radius - far.radius,
            nearDistance: distance(near),
            farDistance: distance(far),
            nearRadius: near.radius,
            farRadius: far.radius,
            nearClears: clearsSprite(near),
            farClears: clearsSprite(far),
            headOffset: Math.abs(near.x - anchors.headX),
          };
        });
        assert.ok(trail.separation >= 4, `Dots crowd each other: ${JSON.stringify(trail)}`);
        assert.ok(trail.nearDistance > trail.farDistance && trail.nearRadius > trail.farRadius);
        assert.ok(trail.nearClears && trail.farClears);
        if (bubbleRect.y + bubbleRect.height <= petRect.y) assert.ok(trail.headOffset < 34);
        assert.equal(await rows.count(), 2);
        assert.ok(await originalTask.isVisible());
      }
    }

    if (process.env.TASKS_SCREENSHOTS) {
      for (const size of [160, 248, 360]) {
        await collapse.click();
        await page.evaluate(size => applyPetSize(size), size);
        await badge.click();
        await page.mouse.move(1, 1);
        await collapse.evaluate(button => button.blur());
        await page.waitForFunction(() => !petActions.classList.contains("revealed"));
        const boxes = await Promise.all([panel.boundingBox(), petStage.boundingBox()]);
        const left = Math.max(0, Math.floor(Math.min(...boxes.map(rect => rect.x)) - 24));
        const top = Math.max(0, Math.floor(Math.min(...boxes.map(rect => rect.y)) - 24));
        const right = Math.min(await page.evaluate(() => innerWidth), Math.ceil(Math.max(...boxes.map(rect => rect.x + rect.width)) + 24));
        const bottom = Math.ceil(Math.max(...boxes.map(rect => rect.y + rect.height)) + 24);
        await page.screenshot({
          path: path.join(process.env.TASKS_SCREENSHOTS, `06-thought-trail-${size}.png`),
          clip: {x:left, y:top, width:right-left, height:bottom-top}, omitBackground: true,
        });
      }
    }

    await publish(Array.from({ length: 7 }, (_, index) => ({
      state: "running", title: `Local task ${index + 1}: verify a deliberately long task title wraps in the active task list`,
      detail: "Confirm that the project description also wraps and that the last row remains reachable by scrolling.",
    })));
    await page.evaluate(() => refreshActivity());
    await page.waitForFunction(() => document.querySelectorAll(".session-title").length === 7);
    assert.equal(await badge.textContent(), "7");
    assert.ok(await content.evaluate(node => node.scrollHeight > node.clientHeight));
    const scrollTrim = await content.evaluate(node => ({
      clip: getComputedStyle(node).clipPath,
      endInset: parseFloat(getComputedStyle(node, "::-webkit-scrollbar-track").marginBottom),
    }));
    assert.notEqual(scrollTrim.clip, "none");
    assert.ok(scrollTrim.endInset >= 12);
    const fixedHeader = await collapse.boundingBox();
    await content.hover();
    await page.mouse.wheel(0, 800);
    await page.waitForFunction(() => threadContent.scrollTop > 0 &&
      threadContent.scrollHeight - threadContent.clientHeight - threadContent.scrollTop <= 1);
    const scroll = await content.evaluate(node => node.scrollTop);
    assert.ok(scroll > 0);
    assert.deepEqual(await collapse.boundingBox(), fixedHeader);
    await page.evaluate(() => refreshActivity());
    assert.equal(await content.evaluate(node => node.scrollTop), scroll);

    await publish([...running, waiting, history]);
    await page.evaluate(() => refreshActivity());
    await page.waitForFunction(() => document.querySelectorAll(".session-title").length === 3);
    assert.equal(await rows.first().textContent(), waiting.title);
    assert.ok((await panel.textContent()).includes(waiting.detail));

    await publish([], true);
    await page.evaluate(() => refreshActivity());
    await panel.getByText("Source unavailable").waitFor();
    assert.equal(await rows.count(), 0);
    await publish([]);
    await page.evaluate(() => refreshActivity());
    await panel.getByText("No active tasks").waitFor();
    await collapse.click();
    assert.equal(await badge.getAttribute("aria-expanded"), "false");

    await page.evaluate(() => { managed = true; requestedState = "auto"; });
    await publish(running.map(task => ({
      ...task, detail: `Executing · ${task.detail} · OpenCode · provider/model`,
    })));
    await page.evaluate(() => refreshActivity());
    await page.waitForFunction(() => document.querySelectorAll(".session-title").length === 2);
    await badge.click();
    assert.deepEqual(await panel.locator(".session-detail").allTextContents(), running.map(task => task.detail));

    const limitsButton = page.locator("#limitsButton");
    const settingsButton = page.locator("#settingsButton");
    await page.evaluate(() => { limitsButton.hidden = false; });
    await page.waitForFunction(() => !document.getElementById("threadPopover").getAnimations().length);
    await rows.first().hover();
    for (const size of [120, 160, 248, 360, 120]) {
      await page.evaluate(size => applyPetSize(size), size);
      await rows.first().hover();
      for (const button of [limitsButton, settingsButton]) {
        const clear = await button.evaluate(el => {
          const buttonRect = el.getBoundingClientRect();
          const panelRect = document.querySelector("#threadPopover").getBoundingClientRect();
          const hit = document.elementFromPoint(buttonRect.x + buttonRect.width / 2, buttonRect.y + buttonRect.height / 2);
          return el.contains(hit) && (buttonRect.right <= panelRect.left || buttonRect.left >= panelRect.right ||
            buttonRect.bottom <= panelRect.top || buttonRect.top >= panelRect.bottom);
        });
        assert.ok(clear, `Task panel covers ${await button.getAttribute("id")} at ${size}`);
      }
    }
    await limitsButton.click();
    assert.equal(await badge.getAttribute("aria-expanded"), "true");
    const limits = page.locator("#limitsPopover");
    await limits.waitFor({ state: "visible" });
    const bubbleRect = await panel.boundingBox();
    const limitsRect = await limits.boundingBox();
    assert.ok(limitsRect.x + limitsRect.width <= bubbleRect.x || bubbleRect.x + bubbleRect.width <= limitsRect.x);
    await limitsButton.click();
    await limits.waitFor({ state: "hidden" });
    assert.equal(await badge.getAttribute("aria-expanded"), "true");
    await limitsButton.click();
    await limits.waitFor({ state: "visible" });
    await app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const area = screen.getDisplayMatching(window.getBounds()).workArea;
      window.setPosition(area.x - 240, area.y - 210);
    });
    await page.waitForFunction(() => limitsLayout.clipTop >= 180);
    await rows.first().hover();
    const edgeOverlap = await panel.evaluate(node => {
      const tasks = node.getBoundingClientRect();
      const quotas = limitsPopover.getBoundingClientRect();
      return tasks.left < quotas.right && tasks.right > quotas.left &&
        tasks.top < quotas.bottom && tasks.bottom > quotas.top;
    });
    assert.equal(edgeOverlap, false, "Limits drawer covers task panel at screen edge");
    await settingsButton.click();
    await page.locator("#closeSettings").waitFor({ state: "visible" });
    assert.equal(await badge.getAttribute("aria-expanded"), "false");
    await page.locator("#closeSettings").click();
    async function moveNearCenter() {
      return app.evaluate(({ screen, BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        const bounds = win.getBounds();
        const area = screen.getDisplayMatching(bounds).workArea;
        const center = Math.round(area.x + area.width / 2);
        win.setPosition(Math.round(center - bounds.width / 2 - 32), area.y);
        return center;
      });
    }
    await moveNearCenter();
    await page.waitForFunction(() => limitsLayout.clipTop === 0);
    await page.evaluate(() => applyPetSize(360));
    await badge.click();
    assert.equal(await badge.getAttribute("aria-expanded"), "true");
    const getWindowBounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    async function dragAcrossCenter() {
      const center = await moveNearCenter();
      const before = await getWindowBounds();
      const stage = await petStage.boundingBox();
      const x = Math.round(stage.x + stage.width * .5);
      const y = Math.round(stage.y + stage.height * .65);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForFunction(() => petDragging);
      await page.mouse.move(x + 64, y);
      await page.waitForFunction(() => !popoverOpen);
      await page.mouse.up();
      let after;
      for (let attempt = 0; attempt < 20; attempt++) {
        after = await getWindowBounds();
        if (Math.abs(after.x - before.x - 64) <= 2) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.ok(before.x + before.width / 2 < center && after.x + after.width / 2 > center);
      assert.ok(Math.abs(after.x - before.x - 64) <= 2);
    }

    await panel.locator(".session-item").first().press("Escape");
    assert.equal(await badge.getAttribute("aria-expanded"), "false");
    assert.ok(await limits.isVisible());
    await badge.click();
    await dragAcrossCenter();
    assert.ok(await limits.isVisible());
    await page.evaluate(() => setLimitsOpen(false));
    await badge.click();
    await dragAcrossCenter();
    assert.equal(await badge.getAttribute("aria-expanded"), "false");
    console.log("Task bubble: equal rows, 160/360 standing and sitting, trail, scrolling, offline, controls at 120/160/248/360, limits toggle and drag");
  } finally {
    await app.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
