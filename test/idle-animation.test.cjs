const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { DEFAULT_SETTINGS, normalizeSettings } = require("../src/main/settings.js");

const renderer = fs.readFileSync(path.join(__dirname, "../src/renderer.js"), "utf8");
const pending = new Promise(() => {});
const flush = () => new Promise(setImmediate);
const strip = number => `./kitsu-typing-hd-strips/${String(number).padStart(2, "0")}.png`;

function loadRenderer(decode) {
  const elements = new Map();
  const timers = new Map();
  const drags = [];
  const mouse = [];
  const writes = [];
  let timerId = 0;
  let ready;
  const imageDecode = new Promise(resolve => { ready = resolve; });
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      const listeners = new Map();
      elements.set(id, {
        classList: {
          add: name => classes.add(name),
          remove: (...names) => names.forEach(name => classes.delete(name)),
          contains: name => classes.has(name),
          toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
        },
        style: {
          setProperty(name, value) { this[name] = value; },
          removeProperty(name) { delete this[name]; },
        },
        listeners,
        addEventListener: (name, listener) => listeners.set(name, listener),
        contains: () => false,
        querySelector: element,
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 192, bottom: 208, width: 192, height: 208 }),
        setAttribute() {},
      });
    }
    return elements.get(id);
  }
  const window = {
    addEventListener() {},
    matchMedia: () => ({ matches: false }),
    setTimeout(callback, delay) {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: id => timers.delete(id),
    AgentWhiskerGeometry: { load: () => pending, contains: (mask, x) => mask === 0 && x === 20 },
    codexPets: {
      listProviders: () => pending,
      onConsoleCommand() {},
      dragWindow: action => drags.push(action),
      setIgnoreMouseEvents: ignore => mouse.push(ignore),
      updateSettings: patch => new Promise(resolve => writes.push({ patch, resolve })),
    },
  };
  const document = {
    activeElement: null,
    getElementById: element,
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = vm.createContext({
    window, document, location: { search: "" }, URLSearchParams, performance,
    Image: class { decode() { return decode ? decode(this.src) : imageDecode; } },
  });
  const evaluate = code => vm.runInContext(code, context);
  evaluate(renderer);
  function tick(delay) {
    assert.equal(timers.size, 1);
    const [[id, frame]] = timers;
    if (delay !== undefined) assert.equal(frame.delay, delay);
    timers.delete(id);
    frame.callback();
  }
  return { element, evaluate, timers, tick, drags, mouse, ready, writes };
}

test("idle animation settings default safely and preserve the opt-in", () => {
  assert.equal(DEFAULT_SETTINGS.idleAnimationMode, "continuous");
  for (const value of [undefined, null, "", true, "invalid", "continuous"]) {
    assert.equal(normalizeSettings({ idleAnimationMode: value }).idleAnimationMode, "continuous");
  }
  assert.equal(normalizeSettings({ idleAnimationMode: "events-only" }).idleAnimationMode, "events-only");
});

test("Kitsu Running at a 269px physical cell uses decoded HD strips in order", async () => {
  const decodes = new Map();
  const { element, evaluate, tick, timers } = loadRenderer(url => new Promise(resolve => {
    assert.equal(decodes.has(url), false);
    decodes.set(url, resolve);
  }));
  evaluate(`
    const kitsu = { id: "kitsu", spritesheetDataUrl: "test", displayName: "Kitsu" };
    pets = [kitsu];
    applyPet(kitsu);
    petSize = 160;
    window.devicePixelRatio = 1.5;
    window.innerWidth = window.innerHeight = 600;
    window.AgentWhiskerGeometry.load = async () => ({
      area: 14800, width: 150, height: 170, left: 0, top: 0, masks: new Map(),
      leftByRow: new Uint16Array(208), rightByRow: new Uint16Array(208),
    });
    petStage.classList.add("hd");
    packedHD.typing.image = {};
    Math.random = () => 0;
    livePhase = "checking";
    setState("running");
  `);
  await flush();
  const pet = element("pet");
  const showsStrip = () => pet.classList.contains("typing-strip-ready");
  assert.equal(Math.round(evaluate("192 * spriteScale * window.devicePixelRatio")), 269);
  assert.deepEqual([...decodes.keys()], [strip(0), strip(1)]);
  assert.equal(showsStrip(), false);
  decodes.get(strip(0))();
  await flush();
  tick(16);
  assert.equal(showsStrip(), false);
  assert.equal(evaluate("displayedCell"), 0);
  decodes.get(strip(1))();
  await flush();
  tick(16);
  assert.equal(showsStrip(), true);
  assert.equal(pet.classList.contains("typing-hd-ready"), false);
  assert.equal(pet.style["--typing-strip-image"], `url("${strip(0)}")`);
  for (let cell = 1; cell <= 7; cell++) {
    tick(40);
    assert.equal(evaluate("displayedCell"), cell);
  }
  assert.equal(pet.style["--typing-strip-image"], `url("${strip(1)}")`);
  assert.equal(pet.style["--typing-strip-position"], "100% 0");
  tick(40);
  assert.equal(showsStrip(), true);
  assert.equal(evaluate("displayedCell"), 7);
  assert.equal(pet.style["--typing-strip-image"], `url("${strip(1)}")`);
  decodes.get(strip(2))();
  decodes.get(strip(3))();
  await flush();
  tick(16);
  assert.equal(evaluate("displayedCell"), 8);
  const resolved = new Set([0, 1, 2, 3]);
  for (let cell = 9; cell <= 71; cell++) {
    const lookahead = Math.floor((cell - 1) / 4) + 1;
    if (!resolved.has(lookahead)) {
      decodes.get(strip(lookahead))();
      resolved.add(lookahead);
      await flush();
    }
    tick(40);
    assert.equal(evaluate("displayedCell"), cell);
  }
  assert.equal(decodes.has(strip(18)), true);
  decodes.get(strip(18))();
  await flush();
  tick(520);
  assert.equal(evaluate("displayedCell"), 72);
  assert.equal(pet.style["--typing-strip-image"], `url("${strip(18)}")`);
  evaluate('setState("review")');
  assert.equal(showsStrip(), false);
  assert.equal(pet.style["--typing-strip-image"], undefined);
  decodes.get(strip(19))();
  await flush();
  assert.equal(showsStrip(), false);
  assert.equal(timers.size, 1);
  assert.equal(decodes.has("./kitsu-typing-hd.webp"), false);
});

test("A failed first preload holds HD rest and retries before starting Running", async () => {
  const urls = [];
  const { element, evaluate, tick } = loadRenderer(url => {
    urls.push(url);
    if (url === strip(1) && urls.length === 2) return Promise.reject(new Error("decode failed"));
    return Promise.resolve();
  });
  const pet = element("pet");
  evaluate(`
    let typingNow = 0;
    performance = { now: () => typingNow };
    applyPet({ id: "kitsu", spritesheetDataUrl: "test", displayName: "Kitsu" });
    petSize = 160;
    window.devicePixelRatio = 1.5;
    setState("running");
  `);
  await flush();
  tick(16);
  for (const type of ["strip", "sd", "hd"]) {
    assert.equal(pet.classList.contains(`typing-${type}-ready`), false);
  }
  assert.equal(evaluate("displayedCell"), 0);
  evaluate("typingNow = 2000");
  tick(2000);
  assert.deepEqual(urls, [strip(0), strip(1), strip(1)]);
  await flush();
  tick(16);
  assert.equal(pet.classList.contains("typing-strip-ready"), true);
  tick(40);
  assert.equal(evaluate("displayedCell"), 1);
});

test("Kitsu Running preview plays 72 HD frames and repaints Idle without decoding an accent", async () => {
  const urls = [];
  const { element, evaluate, tick, timers } = loadRenderer(url => {
    urls.push(url);
    return Promise.resolve();
  });
  evaluate(`
    applyPet({ id: "kitsu", spritesheetDataUrl: "test", displayName: "Kitsu" });
    petSize = 160;
    window.devicePixelRatio = 1.5;
    applyIdleAnimationMode("events-only");
    setState("idle");
    playOnce("running");
  `);
  await flush();
  assert.equal(evaluate("previewFrames"), 72);
  tick(16);
  for (let cell = 1; cell < 72; cell++) {
    await flush();
    tick(40);
    assert.equal(evaluate("displayedCell"), cell);
  }
  tick(40);
  assert.equal(evaluate("previewState"), "");
  assert.equal(evaluate("currentState"), "idle");
  assert.equal(element("pet").classList.contains("typing-strip-ready"), false);
  for (let cell = 0; cell < 72; cell++) tick(60);
  assert.equal(timers.size, 0);
  assert.deepEqual(urls, Array.from({ length: 18 }, (_, number) => strip(number)));
});

test("Kitsu Running drops an atlas frame and mask before repainting at a smaller scale", async () => {
  const urls = [];
  const { element, evaluate, tick } = loadRenderer(url => {
    urls.push(url);
    return pending;
  });
  const pet = element("pet");
  evaluate(`
    applyPet({ id: "kitsu", spritesheetDataUrl: "test", displayName: "Kitsu" });
    petSize = 360;
    window.devicePixelRatio = 1.5;
    packedHD.typing.image = {};
    setState("running");
  `);
  await flush();
  tick(40);
  assert.equal(pet.classList.contains("typing-hd-ready"), true);
  assert.equal(evaluate("displayedCell"), 1);
  evaluate("applyPetSize(160)");
  assert.equal(pet.classList.contains("typing-hd-ready"), false);
  assert.equal(evaluate("displayedCell"), 0);
  tick(40);
  assert.deepEqual(urls, [strip(0), strip(1)]);
  assert.equal(evaluate("displayedCell"), 0);
  assert.equal(pet.classList.contains("typing-sd-ready"), false);
});

test("rapid preference changes apply immediately and an earlier write cannot reset the control", async () => {
  const { element, evaluate, writes } = loadRenderer();
  const select = element("idleAnimationMode");
  const change = select.listeners.get("change");
  select.value = "events-only";
  const first = change();
  assert.equal(evaluate("idleAnimationMode"), "events-only");
  select.value = "continuous";
  const second = change();
  assert.equal(evaluate("idleAnimationMode"), "continuous");

  assert.deepEqual(writes.map(write => write.patch.idleAnimationMode), ["events-only", "continuous"]);
  writes[0].resolve(writes[0].patch);
  await first;
  assert.equal(select.value, "continuous");
  writes[1].resolve(writes[1].patch);
  await second;
  assert.equal(evaluate("savedIdleAnimationMode"), "continuous");
});

test("generic Idle stays parked across JSON refreshes and wakes through the primary drag handler", async () => {
  const { element, evaluate, timers, tick, drags, mouse } = loadRenderer();
  const delays = [1680, 660, 660, 840, 840, 1920];
  evaluate('setState("idle")');
  tick(delays[0]);
  evaluate('applyIdleAnimationMode("events-only")');
  delays.slice(1).forEach(delay => tick(delay));
  assert.equal(evaluate("displayedCell"), 0);
  evaluate(`
    provider = "json-status";
    window.codexPets.readActivity = async () => ({ petState: "idle" });
    renderActivity = () => {};
    scheduleNextRefresh = () => {};
  `);
  for (let i = 0; i < 3; i++) await evaluate("refreshActivity()");
  assert.equal(timers.size, 0);

  const press = element(".pet-stage").listeners.get("mousedown");
  const event = { target: element("pet"), button: 0, clientX: 30, clientY: 40, preventDefault() {} };
  evaluate("shape = { masks: new Map([[0, 0]]) }");
  press(event);
  assert.equal(timers.size, 0);
  assert.deepEqual(drags, []);
  event.clientX = 20;
  press(event);
  assert.deepEqual(drags, ["start"]);
  assert.equal(mouse.at(-1), false);
  const [wakeTimer] = timers.keys();
  press(event);
  assert.deepEqual([...timers.keys()], [wakeTimer]);
  delays.forEach(delay => tick(delay));
  assert.equal(timers.size, 0);
  assert.equal(evaluate("displayedCell"), 0);

  evaluate('applyIdleAnimationMode("continuous")');
  tick(0);
  assert.equal(evaluate("displayedCell"), 1);
});

test("Kitsu HD Idle waits for the atlas, then parks and supports all four previews", async () => {
  const { evaluate, timers, tick, ready } = loadRenderer();
  evaluate(`
    applyPet({ id: "kitsu", spritesheetDataUrl: "test", displayName: "Kitsu" });
    petStage.classList.add("hd");
    applyIdleAnimationMode("events-only");
    setState("idle");
  `);
  tick(50);
  assert.equal(evaluate("displayedCell"), 0);
  ready();
  await new Promise(setImmediate);
  tick(50);
  for (let frame = 0; frame < 72; frame++) tick(60);
  assert.equal(evaluate("displayedCell"), 0);
  assert.equal(timers.size, 0);
  assert.equal(evaluate('petElement.classList.contains("idle-hd-ready")'), true);

  // Treat the other three atlases as decoded so each preview shows its full cycle.
  evaluate(`
    petSize = 360;
    window.devicePixelRatio = 1.5;
    packedHD.typing.image = packedHD.waiting.image = packedHD.failed.image = {};
  `);
  for (const [state, count] of Object.entries({ idle: 72, running: 72, waiting: 32, failed: 112 })) {
    evaluate(`playOnce("${state}")`);
    if (state === "running") await flush();
    for (let frame = 1; frame < count; frame++) {
      tick();
      assert.equal(evaluate("previewState"), state);
    }
    tick();
    assert.equal(evaluate("previewState"), "");
    assert.equal(evaluate("currentState"), "idle");
    if (state !== "idle") for (let frame = 0; frame < 72; frame++) tick(60);
    assert.equal(evaluate("displayedCell"), 0);
    assert.equal(timers.size, 0);
  }

  evaluate('playOnce("idle"); liveState = "failed"');
  for (let frame = 0; frame < 72; frame++) tick(60);
  assert.equal(evaluate("currentState"), "failed");
  assert.equal(evaluate("previewState"), "");
  tick(75);
  evaluate('liveState = "idle"; setState(liveState)');
  for (let frame = 0; frame < 72; frame++) tick(60);
  evaluate('applyPet({ id: "demo", spritesheetDataUrl: "test", displayName: "Demo" })');
  assert.equal(evaluate('petElement.classList.contains("kitsu-idle")'), false);
  [1680, 660, 660, 840, 840, 1920].forEach(delay => tick(delay));
  assert.equal(timers.size, 0);
  evaluate('applyPet({ id: "another", spritesheetDataUrl: "test", displayName: "Another" })');
  assert.equal(timers.size, 0);
  assert.equal(evaluate("displayedCell"), 0);
});
