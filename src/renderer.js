const COLUMNS = 8;
const ROWS = 9;
const IDLE_FRAMES = [
  { rowIndex: 0, columnIndex: 0, frameDurationMs: 280 },
  { rowIndex: 0, columnIndex: 1, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 2, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 3, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 4, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 5, frameDurationMs: 320 },
];
const LONG_IDLE_FRAMES = IDLE_FRAMES.map((frame) => ({
  ...frame,
  frameDurationMs: frame.frameDurationMs * 6,
}));
const STATE_FRAMES = {
  idle: IDLE_FRAMES,
  "running-right": rowFrames(1, 8, 120, 220),
  "running-left": rowFrames(2, 8, 120, 220),
  waving: rowFrames(3, 4, 140, 280),
  jumping: rowFrames(4, 5, 140, 280),
  failed: rowFrames(5, 8, 140, 240),
  waiting: rowFrames(6, 6, 150, 260),
  running: rowFrames(7, 6, 120, 220),
  review: rowFrames(8, 6, 150, 280),
};
const ACTIVE_REFRESH_MS = 3000;
const IDLE_REFRESH_MS = 8000;
const DESKTOP_REFRESH_MS = 30000;

const params = new URLSearchParams(location.search);
const { translator, apply: translateElements, languages } = window.AgentWhiskerLocale;
const { locale, t, taskCount: formatTaskCount } = translator(params.get("locale"));
document.documentElement.lang = locale;
translateElements(document, t);
const codexHome = params.get("codexHome") || "";
const initialPetId = params.get("pet") || "";
const initialState = params.get("state") || "";
let provider = params.get("provider") || "";
let petSize = Number(params.get("petSize")) || 0;
let currentState = null;
let requestedState = "auto";
let timer = null;
let resumeIdle = null;
let pendingTypingStart = null;
let idleAnimationMode = "continuous";
let pets = [];
let skinSelection = null;
let selectedPetId = "";
let statusFile = params.get("statusFile") || "";
let popoverOpen = false;
let settingsOpen = false;
let refreshInFlight = false;
let refreshQueued = false;
let ignoringMouseEvents = null;
let lastPointer = null;
let controlDragging = false;
let petDragging = false;
let lastDragScreenX = 0;
let lastDragScreenY = 0;

let pendingDragFrame = null;
let refreshTimer = null;
let lastActivityState = "idle";
let providers = [];
let providerById = new Map();

const petElement = document.getElementById("pet");
const petStage = document.querySelector(".pet-stage");
const petActions = document.getElementById("petActions");
const settingsButton = document.getElementById("settingsButton");
let actionsVisible = false;
let hideActionsTimer = null;
let arcTravelArea = null;
let keyboardNavigation = false;
const threadBadge = document.getElementById("threadBadge");
const threadPopover = document.getElementById("threadPopover");
const collapseTasks = document.getElementById("collapseTasks");
const taskCount = document.getElementById("taskCount");
const taskScope = document.getElementById("taskScope");
const taskMessage = document.getElementById("taskMessage");
const threadContent = threadPopover.querySelector(".thread-content");
const threadBody = threadContent.querySelector(".thread-body");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let taskPanelLayout = null;
let taskPanelResize = null;
const settingsPopover = document.getElementById("settingsPopover");
const managedFile = params.get("managedFile") || "";
let managed = params.get("managed") === "1";
const stateNames = Object.fromEntries(["idle", "running", "waiting", "failed", "review"].map(state => [state, t(state)]));
stateNames.waving = t("accepted");
let liveState = "idle";
let livePhase = "";
let previewFrames = 0;
let previewState = "";
let lastGesture = "";
const providerSelect = document.getElementById("providerSelect");
const statusFileInput = document.getElementById("statusFileInput");
const statusFileRow = document.getElementById("statusFileRow");
const petSizeInput = document.getElementById("petSizeInput");
const idleAnimationSelect = document.getElementById("idleAnimationMode");
const idleAnimationStatus = document.getElementById("idleAnimationStatus");
let savedIdleAnimationMode = "continuous";
let idleAnimationRevision = 0;
const sessionList = document.getElementById("sessionList");
const appElement = document.getElementById("app");

function rowFrames(rowIndex, frameCount, frameDurationMs, finalFrameDurationMs) {
  return Array.from({ length: frameCount }, (_value, columnIndex) => ({
    rowIndex,
    columnIndex,
    frameDurationMs: columnIndex === frameCount - 1 ? finalFrameDurationMs : frameDurationMs,
  }));
}

function backgroundPosition(frame) {
  return `${(frame.columnIndex / (COLUMNS - 1)) * 100}% ${(frame.rowIndex / (ROWS - 1)) * 100}%`;
}

function animationForState(state) {
  const frames = STATE_FRAMES[state] || STATE_FRAMES.idle;
  if (state === "idle") return { frames: LONG_IDLE_FRAMES, loopStartIndex: 0 };
  return { frames, loopStartIndex: 0 };
}

function setState(state) {
  if (state === currentState) return;
  startAnimation(state);
}

function finishPreview(atCycleEnd = false) {
  previewFrames = 0;
  const state = requestedState === "auto" ? liveState : requestedState;
  const parkAtSeam = atCycleEnd && previewState === "idle" && state === "idle" &&
    idleAnimationMode === "events-only";
  previewState = "";
  for (const button of document.querySelectorAll("[data-preview]")) button.setAttribute("aria-pressed", "false");
  if (parkAtSeam || (!atCycleEnd && state === currentState)) return false;
  startAnimation(state);
  return true;
}

function playOnce(state) {
  previewState = state;
  const kitsuCycles = {idle:72, running:72, waiting:32, failed:112};
  previewFrames = (selectedPetId === "kitsu" && kitsuCycles[state]) || animationForState(state).frames.length;
  for (const button of document.querySelectorAll("[data-preview]")) button.setAttribute("aria-pressed", String(button.dataset.preview === state));
  startAnimation(state);
}

// Count displayed animation frames, excluding waits for HD assets.
function previewFrame() {
  if (!previewState || previewFrames-- > 0) return false;
  return finishPreview(true);
}

function scheduleAnimationFrame(tick, delay, idleSeam = false) {
  if (idleSeam && !previewState && idleAnimationMode === "events-only") {
    timer = null;
    // The seam frame is already on screen. Keep the next frame and gesture.
    resumeIdle = immediate => { timer = window.setTimeout(tick, immediate ? 0 : delay); };
    return;
  }
  timer = window.setTimeout(tick, delay);
}

function wakeIdle(immediate = false) {
  if (!resumeIdle) return;
  const resume = resumeIdle;
  resumeIdle = null;
  resume(immediate);
}

function applyIdleAnimationMode(value) {
  idleAnimationMode = value === "events-only" ? "events-only" : "continuous";
  idleAnimationSelect.value = idleAnimationMode;
  if (idleAnimationMode === "continuous") wakeIdle(true);
}

let shape = null;
let shapeRequest = 0;
let displayedCell = 0;
let spriteScale = 1;

const TYPING_HD_CELL_WIDTH = 384;
const TYPING_STRIP_FRAMES = 4;

function typingDeviceCellWidth() {
  return (shape ? 192 * spriteScale : petSize) * (window.devicePixelRatio || 1);
}

async function updatePetShape(state) {
  const revision = ++shapeRequest;
  const pet = pets.find(item => item.id === selectedPetId);
  if (!pet) return;
  let url = pet.spritesheetDataUrl, columns = 8, first = 0, count;
  if (pet.id === "kitsu" && state === "running") {
    url = "./kitsu-typing.webp"; columns = 16; count = 216;
  } else if (pet.id === "kitsu" && state === "idle") {
    url = "./kitsu-idle.webp"; columns = 12; count = 120;
  } else if (pet.id === "kitsu" && state === "waiting") {
    url = "./kitsu-waiting.png"; columns = 13; count = 160;
  } else if (pet.id === "kitsu" && state === "failed") {
    url = "./kitsu-failed.png"; columns = 14; count = 112;
  } else {
    const frames = STATE_FRAMES[state] || STATE_FRAMES.idle;
    first = frames[0].rowIndex * columns;
    count = frames.length;
  }
  try {
    const next = await window.AgentWhiskerGeometry.load(JSON.stringify([pet.id, state]), url, columns, first, count);
    if (revision !== shapeRequest) return;
    shape = next;
  } catch (error) {
    if (revision !== shapeRequest) return;
    shape = null;
    console.warn("Sprite geometry unavailable", error);
  }
  petStage.classList.toggle("fitted", Boolean(shape));
  applyPetSize(petSize);
}

function fitPetShape() {
  if (!shape) {
    hideDownscaledTypingAtlas();
    return;
  }
  // Match painted area to the original Wisp's idle pose at the same setting.
  const areaScale = petSize / 192 * Math.sqrt(18584 / shape.area);
  // Crossing a monitor must not change the scale or the point being held.
  const roomX = (limitsLayout?.baseWidth || window.innerWidth) - 68;
  const roomY = window.innerHeight - 74;
  spriteScale = Math.max(0.1, Math.min(areaScale, Math.max(48, roomX) / shape.width,
    Math.max(48, roomY) / shape.height));
  petStage.classList.toggle("hd", spriteScale * (window.devicePixelRatio || 1) > 1);
  const style = petStage.style;
  style.setProperty("--shape-width", shape.width * spriteScale + "px");
  style.setProperty("--shape-height", shape.height * spriteScale + "px");
  style.setProperty("--cell-width", 192 * spriteScale + "px");
  style.setProperty("--cell-x", -shape.left * spriteScale + "px");
  style.setProperty("--cell-y", -shape.top * spriteScale + "px");
  hideDownscaledTypingAtlas();
}

function hideDownscaledTypingAtlas() {
  if (petElement.classList.contains("typing-hd-ready") && typingDeviceCellWidth() <= TYPING_HD_CELL_WIDTH) {
    petElement.classList.remove("typing-hd-ready");
    // The HD rest image is frame zero. Match its hit mask before resize paints.
    displayedCell = 0;
  }
}

function showCell(cell) {
  displayedCell = cell;
  // An animated ear or tail can move away from a stationary pointer.
  if (shape && lastPointer) syncMousePassthrough();
}


function* idleGestures() {
  let calm = 0; // steady breathing or a wider sweep of the tail
  let ear = Math.random() < 0.5 ? 2 : 3;
  while (true) {
    const quietCycles = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < quietCycles; i++) {
      yield calm;
      calm = 1 - calm;
    }
    yield ear;
    ear = ear === 2 ? 3 : 2;
  }
}

function startKitsuIdle() {
  const gestures = idleGestures();
  let gesture = gestures.next().value;
  let index = 0;
  let completedCycle = false;
  const tick = () => {
    if (petStage.classList.contains("hd") && !packedHD.idle.image) {
      warmPackedHD("idle");
      showCell(0);
      timer = window.setTimeout(tick, 50);
      return;
    }
    if (previewFrame()) return;
    petElement.classList.toggle("idle-hd-ready", Boolean(packedHD.idle.image));
    // Only the differing section of each 72-frame cycle is stored again.
    const cell = gesture && index >= 18 && index < 34
      ? 72 + (gesture - 1) * 16 + index - 18 : index;
    petElement.style.backgroundPosition = `${(cell % 12) * 100 / 11}% ${Math.floor(cell / 12) * 100 / 9}%`;
    petElement.style.setProperty("--idle-hd-position", petElement.style.backgroundPosition);
    showCell(cell);
    const idleSeam = index === 0 && completedCycle;
    if (++index === 72) {
      index = 0;
      completedCycle = true;
      gesture = gestures.next().value;
    }
    scheduleAnimationFrame(tick, 60, idleSeam);
  };
  tick();
}


function startKitsuTyping(shapeReady) {
  let phrase = 0;
  let nextAccent = Math.random() < 0.5 ? 1 : 2;
  let plainLoops = 1 + Math.floor(Math.random() * 3);
  let index = 0;
  let stripStarted = false;
  let displayedStrip = null;
  const strips = new Map();

  function loadStrip(number) {
    const existing = strips.get(number);
    if (existing && (existing.pending || existing.image || performance.now() < existing.retryAfter)) return existing;
    const asset = { image: null, pending: true, retryAfter: 0 };
    strips.set(number, asset);
    const image = new Image();
    image.src = `./kitsu-typing-hd-strips/${String(number).padStart(2, "0")}.png`;
    image.decode().then(() => {
      asset.image = image;
    }, () => {
      asset.retryAfter = performance.now() + 2000;
    }).finally(() => { asset.pending = false; });
    return asset;
  }

  const tick = () => {
    if (previewState && previewFrames === 0) {
      finishPreview(true);
      return;
    }
    const width = typingDeviceCellWidth();
    const useStrip = width > 192 && width <= TYPING_HD_CELL_WIDTH;
    const useAtlas = width > TYPING_HD_CELL_WIDTH;
    const cell = phrase * 72 + index;
    const number = Math.floor(cell / TYPING_STRIP_FRAMES);
    let strip;
    if (useStrip) {
      const nextPhrase = phrase === 0 && plainLoops === 1 ? nextAccent : 0;
      let nextNumber = number + 1;
      if (index >= 72 - TYPING_STRIP_FRAMES) {
        nextNumber = previewState ? null : nextPhrase * 72 / TYPING_STRIP_FRAMES;
      }
      for (const key of strips.keys()) {
        if (key !== number && key !== nextNumber) strips.delete(key);
      }
      strip = loadStrip(number);
      const nextStrip = nextNumber === null ? null : loadStrip(nextNumber);
      let missing = strip.image ? null : strip;
      if (!missing && !stripStarted && nextStrip && !nextStrip.image) missing = nextStrip;
      if (missing) {
        // Keep the HD rest pose or the last rendered frame and its mask.
        if (missing.retryAfter && previewState && finishPreview()) return;
        timer = window.setTimeout(tick, Math.max(16, missing.retryAfter - performance.now()));
        return;
      }
    } else if (strips.size) {
      strips.clear();
      stripStarted = false;
    }
    if (useAtlas && !packedHD.typing.image) {
      warmPackedHD("typing");
      timer = window.setTimeout(tick, 50);
      return;
    }
    if (previewFrame()) return;
    petElement.classList.toggle("typing-strip-ready", useStrip);
    petElement.classList.toggle("typing-hd-ready", useAtlas);
    petElement.classList.toggle("typing-sd-ready", !useStrip && !useAtlas);
    if (useStrip) {
      if (number !== displayedStrip) {
        petElement.style.setProperty("--typing-strip-image", `url("${strip.image.src}")`);
        displayedStrip = number;
      }
      const offset = (cell % TYPING_STRIP_FRAMES) * 100 / (TYPING_STRIP_FRAMES - 1);
      petElement.style.setProperty("--typing-strip-position", `${offset}% 0`);
      stripStarted = true;
    } else {
      petElement.style.backgroundPosition = `${(cell % 16) * 100 / 15}% ${Math.floor(cell / 16) * 100 / 13}%`;
      petElement.style.setProperty("--typing-hd-position", petElement.style.backgroundPosition);
    }
    showCell(cell);
    index += 1;
    if (index === 72) {
      index = 0;
      if (phrase !== 0) {
        phrase = 0;
        plainLoops = 1 + Math.floor(Math.random() * 3);
      } else if (--plainLoops === 0) {
        phrase = nextAccent;
        nextAccent = 3 - nextAccent;
      }
    }
    timer = window.setTimeout(tick, !previewState && livePhase === "checking" && index === 0 ? 520 : 40);
  };
  showCell(0);
  // Wait for Running's own fitted size instead of inheriting the previous pose's scale.
  pendingTypingStart = tick;
  void shapeReady.then(() => {
    if (pendingTypingStart !== tick) return;
    pendingTypingStart = null;
    tick();
  });
}

function* waitingGestures() {
  let previous = -1;
  let untilEar = 2 + Math.floor(Math.random() * 2);
  while (true) {
    // Each group offers both tokens together, amber alone and blue alone.
    const remaining = [0, 1, 2];
    while (remaining.length) {
      const choices = remaining.filter(gesture => gesture !== previous);
      previous = choices[Math.floor(Math.random() * choices.length)];
      remaining.splice(remaining.indexOf(previous), 1);
      yield previous;
      if (--untilEar === 0) {
        yield 3;
        untilEar = 2 + Math.floor(Math.random() * 2);
      }
    }
  }
}

// Retain the decoded HD sheet across phrases and status changes.
const packedHD = {
  idle: {image: null, loading: false, retryAfter: 0},
  typing: {image: null, loading: false, retryAfter: 0},
  waiting: {image: null, loading: false, retryAfter: 0},
  failed: {image: null, loading: false, retryAfter: 0},
};

function warmPackedHD(state) {
  const asset = packedHD[state];
  if (asset.image || asset.loading || performance.now() < asset.retryAfter) return;
  asset.loading = true;
  const image = new Image();
  image.src = state === "typing" ? "./kitsu-typing-hd.webp" : `./kitsu-${state}-packed-hd.png`;
  image.decode().then(() => { asset.image = image; }).catch(() => {
    asset.retryAfter = performance.now() + 2000;
  }).finally(() => { asset.loading = false; });
}

function startKitsuWaiting() {
  const gestures = waitingGestures();
  let gesture = gestures.next().value;
  let index = 0;
  let quietFrameMs = 110;
  const tick = () => {
    if (petStage.classList.contains("hd") && !packedHD.waiting.image) {
      warmPackedHD("waiting");
      // The separate neutral painting is also native 3x. Start at the first
      // frame when the atlas is ready, even on a cold launch.
      showCell(0);
      timer = window.setTimeout(tick, 50);
      return;
    }
    if (previewFrame()) return;
    const cell = gesture * 32 + index;
    petElement.style.backgroundPosition = `${(cell % 13) * 100 / 12}% ${Math.floor(cell / 13) * 100 / 12}%`;
    petElement.style.setProperty("--waiting-hd-position",
      `${(cell % 16) * 100 / 15}% ${Math.floor(cell / 16) * 100 / 9}%`);
    petElement.classList.toggle("waiting-hd-ready", Boolean(packedHD.waiting.image));
    showCell(cell);
    const delay = gesture === 4 ? quietFrameMs : gesture === 3 ? 45 : 65;
    if (++index === 32) {
      if (gesture === 4) {
        gesture = gestures.next().value;
      } else {
        gesture = 4;
        quietFrameMs = (2700 + Math.random() * 3000) / 32;
      }
      index = 0;
    }
    timer = window.setTimeout(tick, delay);
  };
  tick();
}

function startKitsuFailed() {
  let cell = 0;
  const tick = () => {
    if (petStage.classList.contains("hd") && !packedHD.failed.image) {
      warmPackedHD("failed");
      showCell(0);
      timer = window.setTimeout(tick, 50);
      return;
    }
    if (previewFrame()) return;
    const position = `${(cell % 14) * 100 / 13}% ${Math.floor(cell / 14) * 100 / 7}%`;
    petElement.style.backgroundPosition = position;
    petElement.style.setProperty("--failed-hd-position", position);
    petElement.classList.toggle("failed-hd-ready", Boolean(packedHD.failed.image));
    showCell(cell);
    cell = (cell + 1) % 112;
    timer = window.setTimeout(tick, 75);
  };
  tick();
}

function startAnimation(state) {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  resumeIdle = null;
  pendingTypingStart = null;
  currentState = state;
  petElement.classList.remove("idle-hd-ready", "typing-hd-ready", "typing-strip-ready", "typing-sd-ready",
    "waiting-hd-ready", "failed-hd-ready");
  petElement.style.removeProperty("--typing-strip-image");
  const typing = state === "running" && selectedPetId === "kitsu";
  petElement.classList.toggle("kitsu-typing", typing);
  petElement.classList.toggle("kitsu-idle", state === "idle" && selectedPetId === "kitsu");
  const shapeReady = updatePetShape(state);
  const waiting = state === "waiting" && selectedPetId === "kitsu";
  petElement.classList.toggle("kitsu-waiting", waiting);
  const failed = state === "failed" && selectedPetId === "kitsu";
  petElement.classList.toggle("kitsu-failed", failed);
  if (failed) return startKitsuFailed();
  if (waiting) return startKitsuWaiting();
  if (typing) return startKitsuTyping(shapeReady);
  if (state === "idle" && selectedPetId === "kitsu") return startKitsuIdle();
  const animation = animationForState(state);
  let index = 0;
  let completedCycle = false;
  const tick = () => {
    if (previewFrame()) return;
    const frame = animation.frames[index];
    petElement.style.backgroundPosition = backgroundPosition(frame);
    showCell(frame.rowIndex * COLUMNS + frame.columnIndex);
    const idleSeam = state === "idle" && index === animation.loopStartIndex && completedCycle;
    if (++index === animation.frames.length) {
      index = animation.loopStartIndex;
      completedCycle = true;
    }
    scheduleAnimationFrame(tick, frame.frameDurationMs, idleSeam);
  };
  tick();
}

function applyPet(pet) {
  const previousState = currentState;
  const kitsuChanged = (selectedPetId === "kitsu") !== (pet.id === "kitsu");
  petElement.style.backgroundImage = `url(${pet.spritesheetDataUrl})`;
  selectedPetId = pet.id;
  if (previewState) finishPreview();
  if (currentState === previousState && currentState !== null) {
    if (kitsuChanged && ["running", "idle", "waiting", "failed"].includes(currentState)) startAnimation(currentState);
    else void updatePetShape(currentState);
  }
  petElement.setAttribute("aria-label", pet.displayName);
  petElement.title = t("petMenuHint", { name: pet.displayName });
  petElement.style.imageRendering = "auto";
  for (const button of document.querySelectorAll(".skin-card")) {
    button.setAttribute("aria-pressed", String(button.dataset.petId === pet.id));
  }
}

function selectPet(petId, options) {
  return skinSelection.select(petId, options);
}

function renderSkinGallery() {
  const gallery = document.getElementById("skinGallery");
  gallery.replaceChildren();
  for (const pet of pets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skin-card";
    button.dataset.petId = pet.id;
    button.setAttribute("aria-label", pet.displayName);
    button.setAttribute("aria-pressed", "false");
    button.title = pet.id === "kitsu" ? t("kitsuDescription") : pet.description || pet.displayName;
    const preview = document.createElement("span");
    preview.className = "skin-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.style.backgroundImage = `url(${pet.spritesheetDataUrl})`;
    const name = document.createElement("span");
    name.textContent = pet.displayName;
    button.append(preview, name);
    button.addEventListener("click", () => selectPet(pet.id));
    gallery.append(button);
  }
}

async function refreshActivity() {
  if (refreshInFlight) {
    refreshQueued = true;
    return;
  }
  refreshInFlight = true;
  try {
    const sourceAtStart = [provider,statusFile,managed];
    const activity = await window.codexPets.readActivity({ codexHome, statusFile, provider });
    if (sourceAtStart[0] !== provider || sourceAtStart[1] !== statusFile || sourceAtStart[2] !== managed) return;
    const offline = Boolean(activity.error || activity.offline || (managed && (activity.invalidState || !Number.isFinite(Date.parse(activity.updatedAt)) || Date.now() - Date.parse(activity.updatedAt) > 45000)));
    liveState = offline ? "idle" : activity.petState || "idle";
    livePhase = activity.active?.phase || "";
    renderActivity(activity, offline);
    if (requestedState === "auto" && !previewState) setState(liveState);
    const gesture = activity.active?.gestureId;
    if (gesture && gesture !== lastGesture && !offline && liveState !== "waiting") {
      lastGesture = gesture;
      if (!previewState && requestedState === "auto") playOnce("waving");
    }
  } finally {
    refreshInFlight = false;
    if (refreshQueued) {
      refreshQueued = false;
      window.setTimeout(() => refreshActivity().catch(console.error), 0);
    } else {
      scheduleNextRefresh();
    }
  }
}

let consoleActiveTask = null;
let contextMenuOpen = false;
let showTaskLabel = true;
let showBusyBubble = true;
let busyTasks = false;
let renderedTaskRows = "";

function updateBusyBubble() {
  threadBadge.classList.toggle("pinned", showBusyBubble && busyTasks);
  document.getElementById("busyBubbleToggle").checked = showBusyBubble;
}
let openingConsole = false;
async function openConsoleTask(taskId) {
  if (openingConsole) return;
  openingConsole = true;
  const error = document.getElementById("consoleError");
  error.textContent = "";
  try { await window.codexPets.openConsole(taskId); }
  catch { error.textContent = t("openConsoleAgain"); setPopoverOpen(true); }
  finally { openingConsole = false; }
}
function renderActivity(activity, offline = false) {
  const active = activity.active;
  consoleActiveTask = isConsoleTask(active) ? active.id : null;
  const isEmpty = activity.source === "json-status" && !consoleActiveTask && activity.state === "idle";
  const live = document.getElementById("liveStatus");
  const other = (activity.sessions || []).filter(item => item.id !== active?.id && item.state === "running").length;
  const question = liveState === "waiting" && activity.source === "json-status" ? active?.detail : "";
  const linkDown = managed ? t("consoleDown") : t("sourceDown");
  const caption = offline ? linkDown : question || (livePhase === "checking" ? t("checksRunning") : stateNames[liveState]) || t("running");
  live.textContent = caption + (question && other ? ` · ${t("otherTasks", { count: new Intl.NumberFormat(locale).format(other) })}` : "");
  live.dataset.offline = String(offline);
  document.getElementById("openStatusTask").hidden = offline || !consoleActiveTask || !["waiting","failed"].includes(liveState);
  const currentTask = document.getElementById("currentTask");
  currentTask.textContent = isEmpty ? t("noTasks") : active?.title || "AgentWhisker";
  currentTask.title = isEmpty ? "" : [active?.title, active?.detail].filter(Boolean).join(" — ");
  currentTask.dataset.empty = String(isEmpty || activity.source === "desktop");
  currentTask.hidden = !showTaskLabel || isEmpty || activity.source === "desktop";
  if (offline) {
    consoleActiveTask = null;
    currentTask.textContent = linkDown;
    currentTask.title = linkDown;
    currentTask.dataset.empty = "false";
    currentTask.hidden = !showTaskLabel;
  } else if (question) {
    currentTask.textContent = live.textContent;
  }
  const isDesktop = activity.source === "desktop";
  const sessions = offline || isDesktop ? [] : (activity.sessions || [])
    .filter(session => isBadgeSession(session) && (!managed || isConsoleTask(session)))
    .sort((left, right) => Number(right.state === "waiting") - Number(left.state === "waiting"));
  const badgeCount = sessions.length;
  busyTasks = sessions.some(session => session.state === "running" || session.state === "waiting");
  updateBusyBubble();
  lastActivityState = activity.state || "idle";
  appElement.classList.toggle("desktop-mode", isDesktop);
  threadBadge.hidden = isDesktop;
  if (isDesktop && popoverOpen) setPopoverOpen(false);
  threadBadge.textContent = badgeCount > 99 ? "99+" : String(badgeCount);
  const countLabel = formatTaskCount(badgeCount);
  threadBadge.title = countLabel;
  threadBadge.setAttribute("aria-label", t("showNumberedTasks", { count: countLabel }));
  taskCount.textContent = badgeCount ? countLabel : t("tasks");
  taskScope.textContent = badgeCount && sessions.every(session => session.state === "running") ? t("inProgress") : "";
  const message = offline ? linkDown : !badgeCount
    ? (activity.state === "failed" && active?.title || t("noTasks")) : "";
  if (taskMessage.textContent !== message) taskMessage.textContent = message;
  renderTaskRows(sessions, activity.source);
  positionLimits();
  syncMousePassthrough();
}

function renderTaskRows(sessions, source) {
  const rows = sessions.map(session => ({
    id: isConsoleTask(session) ? session.id : "",
    state: session.state,
    title: displayTitle(session, source),
    detail: taskDetail(session, source),
  }));
  const signature = JSON.stringify(rows);
  if (signature === renderedTaskRows) return;
  renderedTaskRows = signature;
  const focusedId = sessionList.contains(document.activeElement) && document.activeElement.dataset.taskId;
  const scroll = threadContent.scrollTop;
  sessionList.replaceChildren();
  let focusTarget = collapseTasks;
  for (const row of rows) {
    const item = document.createElement("li");
    const entry = document.createElement(row.id ? "button" : "div");
    entry.className = "session-item";
    if (row.id) {
      entry.type = "button";
      entry.dataset.taskId = row.id;
      entry.addEventListener("click", () => openConsoleTask(row.id));
      if (row.id === focusedId) focusTarget = entry;
    }

    const dot = document.createElement("span");
    dot.className = `session-dot ${row.state}`;
    dot.setAttribute("aria-hidden", "true");
    entry.append(dot);

    const body = document.createElement("span");
    body.className = "session-body";

    const title = document.createElement("strong");
    title.className = "session-title";
    title.textContent = row.title;
    title.title = row.title;
    body.append(title);

    const detail = document.createElement("span");
    detail.className = "session-detail";
    detail.textContent = row.detail;
    detail.title = row.detail;
    body.append(detail);
    entry.append(body);
    item.append(entry);
    sessionList.append(item);
  }
  threadContent.scrollTop = scroll;
  if (focusedId) focusTarget.focus({ preventScroll: true });
}

function isConsoleTask(session) {
  return /^[0-9a-f]{32}$/.test(session?.id || "");
}

function displayTitle(session, source) {
  const title = String(session?.title || "").trim();
  if (!title || isInternalId(title)) return t("threadTitle", { source: labelForSource(source) });
  return title;
}

function isInternalId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function taskDetail(session, source) {
  const detail = source === "json-status" && session.detail !== "Status file activity" ? session.detail : "";
  if (session.state === "waiting") return detail ? t("answerWithDetail", { detail }) : t("answerNeeded");
  if (session.state === "failed") return detail || t("failed");
  const fields = managed ? detail?.split(" · ") || [] : [];
  const clientIndex = fields.findIndex((field, index) => index > 0 &&
    ["Codex", "Claude Code", "OpenCode", "agent-mesh", "Console"].includes(field));
  const context = managed ? (clientIndex > 1 ? fields.slice(1, clientIndex).join(" · ") : "Agent Console")
    : detail || labelForSource(source);
  return session.phase === "checking" ? t("checkingContext", { context }) : context;
}

function isBadgeSession(session) {
  return session?.state === "running" || session?.state === "waiting" || session?.state === "failed";
}

function labelForSource(source) {
  if (source === "json-status") return t("statusFile");
  if (source === "desktop") return t("desktop");
  return providerById.get(source)?.label || t("agent");
}

async function boot() {
  providers = await loadProviders();
  providerById = new Map(providers.map((item) => [item.id, item]));
  renderProviderOptions();
  const settings = await window.codexPets.getSettings().catch(() => ({
    selectedPetId: "",
    selectedState: "auto",
    provider: "codex",
    petSize: 112,
    statusFile: "",
  }));
  initializeLanguage(settings.locale);
  applyIdleAnimationMode(settings.idleAnimationMode);
  savedIdleAnimationMode = idleAnimationMode;
  idleAnimationSelect.disabled = false;
  showBusyBubble = settings.showBusyBubble !== false;
  updateBusyBubble();
  showTaskLabel = settings.showTaskLabel !== false;
  applyTaskLabel(showTaskLabel);
  statusFile = statusFile || settings.statusFile || "";
  provider = provider || settings.provider || "codex";
  if (!providerById.has(provider)) provider = "codex";
  petSize = petSize || settings.petSize || 112;
  requestedState = initialState || settings.selectedState || "auto";
  pets = await window.codexPets.listPets(codexHome);
  renderSkinGallery();
  skinSelection = window.AgentWhiskerSkins.createSelection({
    pets,
    load: pet => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(t("loadPetFailure")));
      image.src = pet.spritesheetDataUrl;
    }),
    save: id => window.codexPets.updateSettings({ selectedPetId: id }),
    apply: applyPet,
    onError: () => {
      document.getElementById("consoleError").textContent = t("selectPetFailure");
      setPopoverOpen(true);
    },
  });
  const preferred = initialPetId || settings.selectedPetId;
  const startupPet = pets.find(pet => pet.id === preferred) || pets[0];
  if (startupPet) await selectPet(startupPet.id, { persist: false });
  statusFileInput.value = statusFile;
  providerSelect.value = managed ? "agent-console" : provider;
  petSizeInput.value = String(petSize);
  applyPetSize(petSize);
  updateProviderControls();
  setState(requestedState === "auto" ? "idle" : requestedState);
  limitsButton.hidden = !managedFile;
  await initializeLimits({...settings, limitsPanelOpen:Boolean(managedFile && settings.limitsPanelOpen)});
  await refreshActivity();
  if (params.get("showSettings") === "1") setSettingsOpen(true);
}

function initializeLanguage(preference) {
  const select = document.getElementById("languageSelect");
  const message = document.getElementById("languageStatus");
  select.add(new Option(t("system"), ""));
  for (const [code, name] of Object.entries(languages)) select.add(new Option(name, code));
  select.value = preference || "";
  select.disabled = false;
  select.addEventListener("change", async () => {
    select.disabled = true;
    message.textContent = "";
    try {
      const saved = await window.codexPets.updateSettings({ locale: select.value });
      preference = saved.locale;
      if (saved.effectiveLocale !== locale) {
        const url = new URL(location.href);
        const state = {
          locale: saved.effectiveLocale,
          provider, statusFile, petSize, state: requestedState,
          pet: selectedPetId, managed: managed ? "1" : "", showSettings: "1",
        };
        for (const [key, value] of Object.entries(state)) url.searchParams.set(key, value);
        location.replace(url.href);
      }
    } catch {
      select.value = preference || "";
      message.textContent = t("selectLanguageError");
    } finally { select.disabled = false; }
  });
}

async function loadProviders() {
  const fallback = [
    { id: "codex", label: "Codex", modes: ["jsonl"], defaultRefreshMs: IDLE_REFRESH_MS },
    { id: "opencode", label: "OpenCode", modes: ["local-api", "sqlite", "bridge-file", "command"], defaultRefreshMs: IDLE_REFRESH_MS },
    { id: "claude-code", label: "Claude Code", modes: ["jsonl"], defaultRefreshMs: IDLE_REFRESH_MS },
    { id: "qwen-code", label: "Qwen Code", modes: ["jsonl"], defaultRefreshMs: IDLE_REFRESH_MS },
    { id: "t3code", label: "T3Code", modes: ["command", "jsonl"], defaultRefreshMs: IDLE_REFRESH_MS },
    { id: "json-status", label: "Status file", modes: ["bridge-file"], requiresStatusFile: true, defaultRefreshMs: IDLE_REFRESH_MS },
    { id: "desktop", label: "Desktop", modes: ["manual"], defaultRefreshMs: DESKTOP_REFRESH_MS },
  ];
  if (!window.codexPets?.listProviders) return fallback;
  const listed = await window.codexPets.listProviders().catch(() => fallback);
  return Array.isArray(listed) && listed.length ? listed : fallback;
}

function renderProviderOptions() {
  providerSelect.textContent = "";
  if (managedFile || managed) providerSelect.add(new Option("Agent Console", "agent-console"));
  for (const item of providers) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.id === "json-status" ? t("customFile") : labelForSource(item.id);
    providerSelect.append(option);
  }
}

function refreshDelayForState() {
  if (lastActivityState === "running" || lastActivityState === "waiting") return ACTIVE_REFRESH_MS;
  return providerById.get(provider)?.defaultRefreshMs || IDLE_REFRESH_MS;
}

function scheduleNextRefresh() {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => refreshActivity().catch(console.error), refreshDelayForState());
}

function setWindowMousePassthrough(ignore) {
  if (petDragging || controlDragging || contextMenuOpen) ignore = false;
  if (!window.codexPets?.setIgnoreMouseEvents || ignoringMouseEvents === ignore) return;
  ignoringMouseEvents = ignore;
  window.codexPets.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
}

function isInteractivePoint(event) {
  return isPointInsideElement(event, document.getElementById("currentTask")) ||
    isPointInsideElement(event, petElement) || isActionPoint(event) ||
    (popoverOpen && isPointInsideElement(event, threadPopover)) ||
    (settingsOpen && isPointInsideElement(event, settingsPopover)) ||
    (limitsOpen && isPointInsideElement(event, limitsPopover));
}

function isPointInsideElement(event, element) {
  if (!element || element.hidden) return false;
  if (element === petElement && shape) {
    const rect = petElement.getBoundingClientRect();
    return window.AgentWhiskerGeometry.contains(shape.masks.get(displayedCell),
      (event.clientX - rect.left) * 192 / rect.width, (event.clientY - rect.top) * 208 / rect.height);
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || event.clientX < rect.left ||
      event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  // Rounded panel corners and the round badge do not own their transparent corners.
  const radiusValue = parseFloat(style.borderTopLeftRadius) || 0;
  const radius = Math.min(rect.width / 2, rect.height / 2,
    style.borderTopLeftRadius.endsWith("%") ? radiusValue * Math.min(rect.width, rect.height) / 100 : radiusValue);
  if (!radius) return true;
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  const dx = Math.max(radius - x, x - (rect.width - radius), 0);
  const dy = Math.max(radius - y, y - (rect.height - radius), 0);
  return dx * dx + dy * dy <= radius * radius;
}

function updateMousePassthrough(event) {
  lastPointer = {clientX:event.clientX, clientY:event.clientY};
  syncMousePassthrough();
}

function isActionPoint(point) {
  if (threadBadge.classList.contains("pinned") && isPointInsideElement(point, threadBadge)) return true;
  return actionsVisible && [threadBadge, limitsButton, settingsButton].some(button => isPointInsideElement(point, button));
}

function updateActions() {
  const p = lastPointer;
  const keyboard = keyboardNavigation && (document.activeElement === petElement ||
    petActions.contains(document.activeElement) || popoverOpen && threadPopover.contains(document.activeElement));
  const travel = actionsVisible && p && arcTravelArea && p.clientX >= arcTravelArea.left && p.clientX <= arcTravelArea.right &&
    p.clientY >= arcTravelArea.top && p.clientY <= arcTravelArea.bottom;
  const overTasks = popoverOpen && p && isPointInsideElement(p, threadPopover);
  if (keyboard || overTasks || p && (isPointInsideElement(p, petElement) || isActionPoint(p) || travel)) {
    window.clearTimeout(hideActionsTimer);
    hideActionsTimer = null;
    if (!actionsVisible) {
      actionsVisible = true;
      petActions.classList.add("revealed");
    }
  } else if (actionsVisible && hideActionsTimer === null) {
    hideActionsTimer = window.setTimeout(() => {
      actionsVisible = false;
      hideActionsTimer = null;
      petActions.classList.remove("revealed");
      setWindowMousePassthrough(!lastPointer || !isInteractivePoint(lastPointer));
    }, 175);
  }
}

function syncMousePassthrough() {
  updateActions();
  setWindowMousePassthrough(!lastPointer || !isInteractivePoint(lastPointer));
}

function beginPetDrag(event) {
  if (event.button !== 0 || event.target !== petElement || !isPointInsideElement(event, petElement)) return;
  petDragging = true;
  lastDragScreenX = event.screenX;
  lastDragScreenY = event.screenY;
  window.codexPets.dragWindow("start", lastDragScreenX, lastDragScreenY);
  petStage.classList.add("is-dragging");
  setWindowMousePassthrough(false);
  wakeIdle();
  event.preventDefault();
}

function updatePetDrag(event) {
  if (!petDragging) return;
  lastDragScreenX = event.screenX;
  lastDragScreenY = event.screenY;
  if (pendingDragFrame === null) pendingDragFrame = window.requestAnimationFrame(flushPetDrag);
}

function flushPetDrag() {
  if (pendingDragFrame !== null) window.cancelAnimationFrame(pendingDragFrame);
  pendingDragFrame = null;
  window.codexPets.dragWindow("move", lastDragScreenX, lastDragScreenY);
}

function endPetDrag(event) {
  if (!petDragging) return;
  flushPetDrag();
  window.codexPets.dragWindow("end");
  petDragging = false;
  petStage.classList.remove("is-dragging");
  updateMousePassthrough(event);
}

function setPopoverOpen(value, moveFocus = false) {
  popoverOpen = value;
  threadBadge.setAttribute("aria-expanded", String(value));
  if (popoverOpen) setSettingsOpen(false);
  appElement.classList.toggle("activity-open", popoverOpen);
  threadPopover.classList.toggle("is-open", popoverOpen);
  threadPopover.setAttribute("aria-hidden", String(!popoverOpen));
  threadPopover.inert = !popoverOpen;
  if (!popoverOpen) {
    taskPanelLayout = null;
    taskPanelResize?.cancel();
    taskPanelResize = null;
  }
  if (moveFocus) {
    if (value) collapseTasks.focus({ preventScroll: true });
    else if (!threadBadge.hidden) {
      keyboardNavigation = true;
      actionsVisible = true;
      petActions.classList.add("revealed");
      threadBadge.focus({ preventScroll: true });
    }
  }
  positionLimits();
  syncMousePassthrough();
}

function setSettingsOpen(value) {
  settingsOpen = value;
  settingsButton.setAttribute("aria-expanded", String(value));
  if (!value && previewState) finishPreview();
  if (settingsOpen) setPopoverOpen(false);
  appElement.classList.toggle("settings-open", settingsOpen);
  settingsPopover.classList.toggle("is-open", settingsOpen);
  settingsPopover.setAttribute("aria-hidden", String(!settingsOpen));
  if (settingsOpen) positionSettingsPopover();
  positionLimits();
  syncMousePassthrough();
}

function applyPetSize(value) {
  petSize = Math.min(360, Math.max(72, Math.round(Number(value) || 112)));
  document.getElementById("app").style.setProperty("--pet-size", `${petSize}px`);
  petSizeInput.value = String(petSize);
  document.getElementById("petSizeValue").value = `${petSize} px`;
  fitPetShape();
  if (settingsOpen) positionSettingsPopover();
  positionLimits();
  syncMousePassthrough();
}

function positionSettingsPopover() {
  settingsPopover.style.maxHeight = "";
  settingsPopover.style.overflowY = "";

  const margin = 8;
  const gap = 12;
  const area = limitsBaseArea();
  const width = Math.min(336, Math.max(120, area.width - 16));
  settingsPopover.style.width = `${width}px`;
  const naturalHeight = settingsPopover.scrollHeight || settingsPopover.offsetHeight || 96;
  const basePetRect = layoutRectInApp(shape ? petStage : petElement);
  const petClearanceTop = visualPetClearanceTop(basePetRect);
  const topMargin = Math.max(margin, (limitsLayout?.clipTop || 0) + margin);
  const availableAbove = Math.max(72, petClearanceTop - gap - topMargin);
  const maxHeight = Math.min(naturalHeight, availableAbove);
  const height = Math.min(naturalHeight, maxHeight);
  const left = clamp(basePetRect.left + basePetRect.width / 2 - width / 2, area.left + margin, area.left + area.width - width - margin);
  const top = Math.max(topMargin, petClearanceTop - height - gap);

  settingsPopover.style.left = `${Math.round(left)}px`;
  settingsPopover.style.top = `${Math.round(top)}px`;
  if (naturalHeight > maxHeight) {
    settingsPopover.style.maxHeight = `${Math.round(maxHeight)}px`;
    settingsPopover.style.overflowY = "auto";
  }
}

function positionThreadPopover(petRect, anchors) {
  const margin = 8;
  const gap = 12;
  const area = limitsBaseArea();
  const visibleLeft = (limitsLayout?.visibleLeft ?? 0) + margin;
  const visibleRight = (limitsLayout?.visibleRight ?? window.innerWidth) - margin;
  const visibleTop = (limitsLayout?.clipTop || 0) + margin;
  const visibleBottom = window.innerHeight - (limitsLayout?.clipBottom || 0) - margin;
  const visibleHeight = Math.max(1, visibleBottom - visibleTop);
  const baseLeft = area.left + margin;
  const baseRight = area.left + area.width - margin;
  const availableAbove = Math.max(0, Math.min(visibleBottom, petRect.top - gap) - visibleTop);
  const leftEdge = Math.min(petRect.left, anchors.minX) - gap;
  const rightEdge = Math.max(petRect.left + petRect.width, anchors.maxX) + gap;
  const spaceLeft = leftEdge - visibleLeft;
  const spaceRight = visibleRight - rightEdge;
  const badgeOnRight = anchors.thought.x >= anchors.headX;
  let width = Math.min(342, Math.max(1, baseRight - baseLeft));
  threadPopover.style.width = `${width}px`;
  const measure = () => collapseTasks.offsetHeight + threadBody.offsetHeight + threadPopover.clientTop * 2;
  const naturalHeight = measure();
  let height = Math.min(naturalHeight, availableAbove);
  let left = clamp(badgeOnRight ? anchors.thought.x + 20 - width : anchors.thought.x - 20, baseLeft, baseRight - width);
  let top = visibleTop + availableAbove - height;
  let edge = "bottom";

  if (availableAbove < Math.min(naturalHeight, 154) && Math.max(spaceLeft, spaceRight) >= 200) {
    const onRight = spaceRight >= 200 && (spaceLeft < 200 || badgeOnRight);
    width = Math.min(342, Math.floor(onRight ? spaceRight : spaceLeft));
    threadPopover.style.width = `${width}px`;
    height = Math.min(visibleHeight, measure());
    left = onRight ? rightEdge : leftEdge - width;
    top = clamp(anchors.headY - height * .5, visibleTop, visibleBottom - height);
    edge = onRight ? "left" : "right";
  } else if (availableAbove < Math.min(naturalHeight, collapseTasks.offsetHeight + 56)) {
    height = Math.min(naturalHeight, visibleHeight);
    top = visibleTop;
  }
  left = Math.round(left);
  top = Math.round(top);
  height = Math.floor(height);
  const panel = {edge, left, top, width, height};
  applyTaskPanelLayout(panel);
  threadPopover.classList.toggle("hint-above", top - visibleTop >= 38);
  return panel;
}

function applyTaskPanelLayout(panel) {
  const previous = taskPanelLayout;
  taskPanelLayout = panel;
  const resize = previous && !reduceMotion.matches && panel.edge === previous.edge &&
    panel.width === previous.width && panel.left === previous.left && panel.height !== previous.height;
  const unchanged = previous && Object.keys(panel).every(key => panel[key] === previous[key]);
  const from = resize ? layoutRectInApp(threadPopover) : null;
  if (!unchanged || reduceMotion.matches) {
    taskPanelResize?.cancel();
    taskPanelResize = null;
  }
  threadPopover.style.left = `${panel.left}px`;
  threadPopover.style.top = `${panel.top}px`;
  threadPopover.style.height = `${panel.height}px`;
  if (from) {
    const frame = rect => ({top:`${rect.top}px`, height:`${rect.height}px`});
    taskPanelResize = threadPopover.animate([frame(from), frame(panel)], {
      id: "thread-resize", duration: 180, easing: "cubic-bezier(.2,.75,.25,1)",
    });
  }
}

function positionThreadTrail(panel, petRect, {headX, headY, thought, controls}) {
  const {edge} = panel;
  const side = thought.x >= headX ? 1 : -1;
  const trail = findThreadTrail(edge, panel, petRect, {headX, headY, side, controls});
  threadPopover.classList.toggle("has-trail", Boolean(trail));
  if (!trail) return;
  for (const name of ["near", "far"]) {
    threadPopover.style.setProperty(`--${name}-x`, `${trail[name].x - threadPopover.clientLeft}px`);
    const anchor = edge === "bottom" ? 1 : .5;
    const offset = trail[name].y - panel.height * anchor + (2 * anchor - 1) * threadPopover.clientTop;
    threadPopover.style.setProperty(`--${name}-y`, `calc(${100 * anchor}% + ${offset}px)`);
  }
}

function findThreadTrail(edge, {left, top, width, height}, petRect, {headX, headY, side, controls}) {
  const below = edge === "bottom";
  const candidates = below ? [20, 28, -20, -28, 38, -38, 52, -52, 68, -68] : [-20, -30, -10, 0, 16, -42, 32];
  for (const offset of candidates) {
    const origin = {
      x: below ? clamp(headX + side * offset - left, 20, width - 20) : edge === "left" ? 0 : width,
      y: below ? height : clamp(headY + offset - top, 20, height - 20),
    };
    const deltaX = headX - left - origin.x;
    const deltaY = headY - top - origin.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 24 || !(below ? deltaY > 0 : edge === "left" ? deltaX < 0 : deltaX > 0)) continue;
    const pointAt = length => ({
      x: origin.x + deltaX * length / distance,
      y: origin.y + deltaY * length / distance,
    });
    const clears = (point, radius) => {
      const x = left + point.x, y = top + point.y;
      return threadDotClearsPet(x, y, radius + 3, petRect) &&
        !controls.some(control => actionOverlaps(control, {left:x-radius, top:y-radius, width:radius*2, height:radius*2}, 5));
    };
    const near = pointAt(below ? 8 : clamp(distance * .12, 8, 16));
    if (!clears(near, 4.5)) continue;
    const reach = below ? clamp(distance * .55, 22, 34) : clamp(distance * .52, 30, 54);
    for (let length = Math.round(reach); length >= (below ? 20 : 28); length -= 2) {
      const far = pointAt(length);
      if (clears(far, 2.5)) return {near, far};
    }
  }
  return null;
}

function threadDotClearsPet(x, y, padding, rect) {
  if (y + padding < rect.top || y - padding > rect.top + rect.height ||
      x + padding < rect.left || x - padding > rect.left + rect.width) return true;
  if (!shape) return false;
  const first = Math.max(shape.top, Math.floor(shape.top + (y - padding - rect.top) / spriteScale));
  const last = Math.min(shape.top + shape.height - 1, Math.floor(shape.top + (y + padding - rect.top) / spriteScale));
  for (let row = first; row <= last; row++) {
    if (!shape.rightByRow[row]) continue;
    const left = rect.left + (shape.leftByRow[row] - shape.left) * spriteScale;
    const right = rect.left + (shape.rightByRow[row] - shape.left) * spriteScale;
    if (x + padding >= left && x - padding <= right) return false;
  }
  return true;
}

function visualPetClearanceTop(rect) {
  return rect.top;
}

function layoutRectInApp(element) {
  const appRect = appElement.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - appRect.left,
    top: rect.top - appRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function updateProviderControls() {
  document.getElementById("connectionName").textContent = managed ? "Agent Console" : provider === "json-status" ? t("statusFile") : labelForSource(provider);

  statusFileRow.hidden = managed || !providerById.get(provider)?.requiresStatusFile;
}

const limitsButton = document.getElementById("limitsButton");
const limitsPopover = document.getElementById("limitsPopover");
const limitsRefreshButton = document.getElementById("limitsRefreshButton");
let limitsOpen = false;
let limitsLayout = null;
let drawerSide = null;
let drawerFade = null;

function chooseDrawerSide(leftRoom, rightRoom, width) {
  if (!drawerSide) return rightRoom >= width || rightRoom >= leftRoom ? "right" : "left";
  const current = drawerSide === "right" ? rightRoom : leftRoom;
  const other = drawerSide === "right" ? leftRoom : rightRoom;
  if (current >= width || (current >= Math.min(176, width) && other < current + 32) || current >= other) return drawerSide;
  return drawerSide === "right" ? "left" : "right";
}

let limitsValue = null;
let limitsError = "";
let limitsTimer = null;
let limitsAgeTimer = null;
let limitsReading = false;
let limitsGeneration = 0;
let limitsChanging = false;
let limitsRefreshOpenedAt = 0;
let limitsBusy = false;

function limitsBaseArea() {
  return limitsLayout ? {left: limitsLayout.petOffset + (limitsLayout.clipLeft || 0),
    width: Math.max(1, limitsLayout.baseWidth - (limitsLayout.clipLeft || 0) - (limitsLayout.clipRight || 0))}
    : {left: 0, width: appElement.getBoundingClientRect().width || window.innerWidth};
}
function applyLimitsLayout(layout) {
  if (!layout || !['baseWidth','petOffset','panelLeft','panelWidth','width','height'].every(key => Number.isFinite(layout[key])) || layout.baseWidth < 120) return;
  limitsLayout = layout;
  fitPetShape();
  petStage.style.left = `${layout.petOffset + layout.baseWidth / 2}px`;
  if (settingsOpen) positionSettingsPopover();
  positionLimits();
  syncLimitsPanelVisibility();
  syncMousePassthrough();
}
// Forehead landmarks on the approved 192 × 208 animation cells.
const kitsuForehead = {idle:[77,27], running:[97,47], waiting:[93,25], failed:[105,25]};

function actionOverlaps({x, y, width, height}, rect, gap) {
  return x + width / 2 + gap > rect.left && x - width / 2 - gap < rect.left + rect.width &&
    y + height / 2 + gap > rect.top && y - height / 2 - gap < rect.top + rect.height;
}

function positionPetActions(rect, taskPanel = null) {
  const landmark = selectedPetId === "kitsu" ? kitsuForehead[currentState] : pets.find(p => p.id === selectedPetId)?.forehead?.[currentState];
  const headX = shape && landmark ? rect.left + (landmark[0] - shape.left) * spriteScale : rect.left + rect.width * .5;
  const headY = shape && landmark ? rect.top + (landmark[1] - shape.top) * spriteScale : rect.top + rect.height * .18;
  const gap = clamp(10 + rect.height * .028, 13, 25);
  const left = (limitsLayout?.visibleLeft ?? 0) + 5;
  const right = (limitsLayout?.visibleRight ?? window.innerWidth) - 5;
  const top = (limitsLayout?.clipTop || 0) + 5;
  const bottom = window.innerHeight - (limitsLayout?.clipBottom || 0) - 5;
  const placed = [];

  function place(button, idealY, direction, width, height) {
    // Try the preferred side first. Near a screen edge, use the other side or
    // move up/down to keep the control outside both the silhouette and its siblings.
    let best = null;
    for (let step = 0; step <= 20; step++) {
      for (const offset of step ? [-step * 12, step * 12] : [0]) {
        const y = clamp(idealY + offset, top + height/2, bottom - height/2);
        let lo = headX, hi = headX;
        if (shape) {
          const start = Math.max(0, Math.floor(shape.top + (y-height/2-gap-rect.top)/spriteScale));
          const end = Math.min(207, Math.ceil(shape.top + (y+height/2+gap-rect.top)/spriteScale));
          for (let row=start; row<=end; row++) {
            if (!shape.rightByRow[row]) continue;
            lo = Math.min(lo, rect.left + (shape.leftByRow[row]-shape.left)*spriteScale);
            hi = Math.max(hi, rect.left + (shape.rightByRow[row]-shape.left)*spriteScale);
          }
        } else { lo = rect.left; hi = rect.left + rect.width; }
        for (const side of [direction, -direction]) {
          const desired = side < 0 ? lo-gap-width/2 : hi+gap+width/2;
          const x = clamp(desired, left+width/2, right-width/2);
          const collision = placed.some(p => Math.abs(x-p.x)<(width+p.width)/2+9 && Math.abs(y-p.y)<(height+p.height)/2+9);
          const blocked = taskPanel && button !== threadBadge && actionOverlaps({x,y,width,height}, taskPanel, 8);
          const score = (blocked ? 100000 : 0) + (collision ? 10000 : 0) + Math.abs(x-desired)*20 + Math.abs(y-idealY) + (side===direction ? 0 : 70);
          if (!best || score < best.score) best = {x,y,width,height,score};
        }
      }
      if (best.score <= step*12) break;
    }
    button.style.left = Math.round(best.x-width/2) + "px";
    button.style.top = Math.round(best.y-height/2) + "px";
    if (!button.hidden && !(taskPanel && button === threadBadge)) placed.push(best);
    return best;
  }

  const rise = clamp(rect.height*.105, 25, 53);
  const thought = place(threadBadge, headY-rise, 1, 40, 30);
  const limits = place(limitsButton, headY-rise+3, -1, 36, 36);
  place(settingsButton, limits.y + 48, -1, 36, 36);
  // Put the two dots on the ray from the ellipse toward the forehead.
  const dx = headX-thought.x, dy = headY-thought.y;
  const radius = 1 / Math.max(.001, Math.hypot(dx/20, dy/15));
  const distance = Math.max(1, Math.hypot(dx,dy));
  for (const [name,extra] of [["near",4],["far",12]]) {
    threadBadge.style.setProperty("--"+name+"-x", (19+dx*(radius+extra/distance))+"px");
    threadBadge.style.setProperty("--"+name+"-y", (14+dy*(radius+extra/distance))+"px");
  }
  const origin = appElement.getBoundingClientRect();
  const minX = Math.min(...placed.map(p=>p.x-p.width/2)), maxX = Math.max(...placed.map(p=>p.x+p.width/2));
  arcTravelArea = {left:origin.left+minX-4, right:origin.left+maxX+4,
    top:origin.top+Math.min(headY,...placed.map(p=>p.y-p.height/2))-5,
    bottom:origin.top+Math.max(headY,...placed.map(p=>p.y+p.height/2))+7};
  return {minX,maxX,headX,headY,thought,controls:placed.filter(action => action !== thought)};
}

function positionLimits() {
  const rect = layoutRectInApp(shape ? petStage : petElement);
  let actions = positionPetActions(rect);
  let taskPanel = null;
  if (popoverOpen) {
    taskPanel = positionThreadPopover(rect, actions);
    if (actions.controls.some(control => actionOverlaps(control, taskPanel, 8))) actions = positionPetActions(rect, taskPanel);
    positionThreadTrail(taskPanel, rect, actions);
  }
  if (limitsOpen && limitsLayout?.open === true && limitsLayout.panelWidth > 24) {
    const preferredWidth = limitsLayout.panelWidth - 24;
    const occupied = [rect, ...actions.controls.map(({x,y,width,height}) =>
      ({left:x-width/2, top:y-height/2, width, height}))];
    if (taskPanel) occupied.push(taskPanel);
    if (settingsOpen) occupied.push(layoutRectInApp(settingsPopover));
    if (!taskPanel && !threadBadge.hidden) {
      const {x,y,width,height} = actions.thought;
      occupied.push({left:x-width/2, top:y-height/2, width, height});
    }
    const nearLeft = Math.min(...occupied.map(item => item.left));
    const nearRight = Math.max(...occupied.map(item => item.left + item.width));
    const minLeft = (limitsLayout.visibleLeft ?? 0) + 12;
    const maxRight = (limitsLayout.visibleRight ?? limitsLayout.width) - 12;
    const leftRoom = Math.floor(nearLeft - 12 - minLeft);
    const rightRoom = Math.floor(maxRight - nearRight - 12);
    const visibleTop = (limitsLayout.clipTop || 0) + 12;
    const visibleBottom = window.innerHeight - (limitsLayout.clipBottom || 0) - 12;
    const maximumHeight = Math.max(1, visibleBottom - visibleTop);
    const minDrawerWidth = Math.min(176, preferredWidth);
    const desiredSide = chooseDrawerSide(leftRoom, rightRoom, preferredWidth);
    const roomOnCurrentSide = drawerSide === "left" ? leftRoom : rightRoom;
    if (!drawerSide || limitsPopover.hidden || roomOnCurrentSide < minDrawerWidth || !limitsPopover.animate ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      drawerFade?.cancel();
      drawerFade = null;
      drawerSide = desiredSide;
    } else if (desiredSide !== drawerSide && !drawerFade) {
      drawerFade = limitsPopover.animate([{opacity:1},{opacity:0}], {duration:100,fill:"forwards"});
      drawerFade.onfinish = () => {
        drawerFade.cancel();
        drawerFade = null;
        drawerSide = desiredSide;
        if (!limitsOpen) return;
        positionLimits();
        limitsPopover.animate([{opacity:0},{opacity:1}], {duration:150});
      };
    }
    const room = drawerSide === "left" ? leftRoom : rightRoom;
    let width = clamp(room, minDrawerWidth, preferredWidth);
    let maxHeight = maximumHeight;
    let minTop = visibleTop;
    let maxBottom = visibleBottom;
    let left = drawerSide === "left" ? nearLeft - width - 12 : nearRight + 12;
    if (room < minDrawerWidth) {
      const above = Math.min(...occupied.map(item => item.top)) - 12;
      const below = Math.max(...occupied.map(item => item.top + item.height)) + 12;
      const topRoom = above - visibleTop;
      const bottomRoom = visibleBottom - below;
      if (Math.max(topRoom, bottomRoom) >= 84) {
        width = Math.min(preferredWidth, maxRight - minLeft);
        left = rect.left + (rect.width - width) / 2;
        if (topRoom >= bottomRoom) maxBottom = above;
        else minTop = below;
        maxHeight = maxBottom - minTop;
      } else if (room >= 102) {
        width = Math.min(room, preferredWidth);
        left = drawerSide === "left" ? nearLeft - width - 12 : nearRight + 12;
      } else if (popoverOpen) {
        setPopoverOpen(false);
        return;
      }
    }
    limitsPopover.style.width = `${width}px`;
    limitsPopover.style.left = `${Math.round(clamp(left, minLeft, maxRight - width))}px`;
    limitsPopover.style.maxHeight = `${maxHeight}px`;
    const height = Math.min((limitsPopover.scrollHeight || 360) + 2, maxHeight);
    limitsPopover.style.top = `${Math.round(clamp(rect.top + rect.height / 2 - height / 2, minTop, maxBottom - height))}px`;
  }
}
function limitsDate(value) {
  const date = typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(+date) ? new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date) : null;
}
function limitsOld(value) {
  const stamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return !Number.isFinite(stamp) || stamp > Date.now() + 5000 || Date.now() - stamp >= 60000;
}
function limitsAge(value) {
  const stamp = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(stamp)) return t("timeUnknown");
  const age = Math.max(0, Date.now() - stamp);
  if (age < 60000) return t("justChecked");
  const minutes = age < 3600000;
  return t(minutes ? "checkedMinutes" : "checkedHours", {
    count: new Intl.NumberFormat(locale).format(Math.floor(age / (minutes ? 60000 : 3600000))),
  });
}
function limitsNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function renderLimits() {
  const host = document.getElementById('limitsProviders');
  const extra = document.getElementById('limitsExtra');
  const message = document.getElementById('limitsStatus');
  const providers = Array.isArray(limitsValue?.providers) ? limitsValue.providers : [];
  const progress = limitsValue?.refresh;
  const completed = Number.isFinite(progress?.completed_at) ? progress.completed_at : 0;
  if (limitsRefreshOpenedAt && completed >= limitsRefreshOpenedAt) limitsRefreshOpenedAt = 0;
  const pendingOpen = limitsRefreshOpenedAt > 0;
  const inFlight = ['queued','running'].includes(progress?.state);
  const requested = Number.isFinite(progress?.requested_at) ? progress.requested_at : progress?.started_at;
  const overdue = pendingOpen ? Date.now() - limitsRefreshOpenedAt > 45000
    : inFlight && (!Number.isFinite(requested) || Date.now() - requested > 45000);
  const busy = limitsOpen && !limitsError && !overdue && (pendingOpen || inFlight);
  const hasSaved = providers.length > 0 || limitsValue?.extra_usage?.status === 'known';
  limitsBusy = busy;
  limitsRefreshButton.classList.toggle('is-refreshing', busy);
  limitsRefreshButton.disabled = busy;
  limitsRefreshButton.setAttribute('aria-busy', String(busy));
  host.setAttribute('aria-busy', String(busy));
  const statusText = busy ? (hasSaved ? t("refreshingSaved") : t("refreshingLimits"))
    : limitsError || (overdue ? t("refreshOverdue")
    : limitsValue?.error || progress?.state === 'error' ? t("refreshFailed")
    : !limitsValue ? t("readLimits") : !providers.length ? t("limitsPending") : '');
  if (message.textContent !== statusText) message.textContent = statusText;
  const failed = !busy && (!!limitsError || overdue || !!limitsValue?.error || progress?.state === 'error');
  limitsRefreshButton.title = failed ? t("retryLimit", { status: statusText })
    : busy ? t("refreshingSaved") : t("refreshLimits");
  limitsRefreshButton.classList.toggle('has-error', failed);
  if (failed) limitsRefreshButton.setAttribute('aria-describedby', 'limitsStatus');
  else limitsRefreshButton.removeAttribute('aria-describedby');
  // A failed request updates the control, but keeps the last rendered snapshot
  // and its dimensions. A first opening can still render an available cache.
  if ((failed || limitsValue?.error || progress?.state === 'error') &&
      (host.childElementCount || extra.childElementCount)) return;
  host.replaceChildren(); extra.replaceChildren();
  for (const provider of providers.slice(0,8)) {
    if (!provider || !['codex','opencode_go'].includes(provider.id)) continue;
    const old = limitsOld(provider.observed_at) || provider.status === 'stale' || !!limitsValue.error || !!limitsError;
    const unknown = provider.connected !== true;
    const partial = ['unknown','unavailable','error'].includes(provider.status);
    const item = limitsNode('section','limits-provider');
    const heading = limitsNode('div','limits-provider-heading');
    heading.append(limitsNode('h3','',String(provider.name || (provider.id === 'codex' ? 'Codex' : 'OpenCode Go')).slice(0,80)));
    if (unknown || partial || old) heading.append(limitsNode('span','limits-state',unknown ? t("noData") : partial ? t("partialLimits") : t("staleLimits")));
    item.append(heading);
    const rows = limitsNode('ul','limits-windows');
    for (const window of (Array.isArray(provider.windows) ? provider.windows : []).slice(0,24)) {
      if (!window || typeof window !== 'object') continue;
      const remaining = window.remaining_percent;
      const known = typeof remaining === 'number' && Number.isFinite(remaining) && remaining >= 0 && remaining <= 100 && !['unknown','unavailable','error'].includes(window.status) && !unknown;
      const reset = limitsDate(window.resets_at);
      const expired = reset && Date.parse(window.resets_at) <= Date.now();
      const stale = old || expired || ['stale','expired'].includes(window.status);
      const row = limitsNode('li','limits-window');
      const line = limitsNode('div','limits-window-line');
      line.append(limitsNode('span','',String(window.label || t("limit")).slice(0,80)),limitsNode('strong','',known ? t(stale ? "previousRemaining" : "remaining", { value: new Intl.NumberFormat(locale, { style:"percent", maximumFractionDigits:1 }).format(remaining / 100) }) : t("noData")));
      row.append(line);
      if (known && !stale) {
        const track = limitsNode('div','limits-track');
        track.setAttribute('role','meter');track.setAttribute('aria-label',t("remainingLabel", { label: window.label || t("limit") }));
        track.setAttribute('aria-valuenow',String(remaining));track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
        const fill = limitsNode('span','');fill.style.width=`${remaining}%`;track.append(fill);row.append(track);
      }
      row.append(limitsNode('p','limits-reset',expired ? t("limitWindowEnded") : reset ? t("resetAt", { time: reset }) : t("resetUnknown")));
      rows.append(row);
    }
    item.append(rows);
    if (!rows.children.length) item.append(limitsNode('p','limits-message',t("subscriptionUnknown")));
    item.append(limitsNode('p','limits-observed',limitsAge(provider.observed_at)));
    host.append(item);
  }
  const wallet = limitsValue?.extra_usage;
  if (wallet && typeof wallet === 'object') {
    const raw = wallet.available_usd;
    const known = typeof raw === 'string' && /^\d+\.\d{8}$/.test(raw) && Number.isFinite(Number(raw));
    const stale = limitsOld(wallet.observed_at) || wallet.stale || wallet.status !== 'known' || !!limitsValue.error || !!limitsError;
    const line = limitsNode('div','limits-extra-line');
    line.append(limitsNode('span','','OpenCode Extra Usage'),limitsNode('strong','',known ? t(stale ? "balancePrevious" : "balanceAvailable", { value: new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(Number(raw)) }) : t("balanceUnknown")));
    extra.append(line,limitsNode('p','limits-observed',limitsAge(wallet.observed_at)));
  }
  positionLimits();syncMousePassthrough();
}
async function refreshLimits() {
  if (!limitsOpen || limitsReading || !window.codexPets.readLimits) return;
  limitsReading = true;
  try {
    const value = await window.codexPets.readLimits();
    if (value && typeof value === 'object' && !Array.isArray(value)) {limitsValue = value; limitsError = '';}
    else limitsError = t("limitsPending");
  } catch {
    if (limitsValue) limitsValue = {...limitsValue,error:'console_unavailable'};
    limitsError = t("limitsUnavailable");
  } finally {
    limitsReading = false;
    if (limitsOpen) {renderLimits();syncMousePassthrough();}
  }
}
function syncLimitsPanelVisibility() {
  // Opening is an intent until the host commits a nonzero drawer column.
  // Set its full width while hidden, then measure the revealed content before paint.
  const visible = limitsOpen && limitsLayout?.open === true && limitsLayout.panelWidth > 24;
  if (visible) positionLimits();
  limitsPopover.hidden = !visible;
  limitsPopover.setAttribute('aria-hidden', String(!visible));
  if (visible) positionLimits();
}
function updateLimitsVisibility() {
  if (!limitsOpen) {
    drawerFade?.cancel();
    drawerFade = null;
    drawerSide = null;
  }
  limitsButton.setAttribute('aria-expanded',String(limitsOpen));
  limitsButton.setAttribute('aria-label',limitsOpen ? t("hideLimits") : t("showLimits"));
  limitsButton.title = limitsOpen ? t("hideLimits") : t("showLimits");
  if (limitsTimer) window.clearInterval(limitsTimer);
  if (limitsAgeTimer) window.clearInterval(limitsAgeTimer);
  limitsTimer = limitsAgeTimer = null;
  if (limitsOpen) {
    renderLimits(); void refreshLimits();
    limitsTimer = window.setInterval(()=>{void refreshLimits();},3000);
    limitsAgeTimer = window.setInterval(()=>{if(limitsOpen)renderLimits();},1000);
  }
  syncLimitsPanelVisibility();syncMousePassthrough();
}
async function setLimitsOpen(value) {
  const generation = ++limitsGeneration;
  const prior = limitsOpen;
  limitsOpen = value === true; limitsChanging = true;
  if (limitsOpen && !prior) limitsRefreshOpenedAt = Date.now();
  if (!limitsOpen) limitsRefreshOpenedAt = 0;
  updateLimitsVisibility();
  try {
    const layout = await window.codexPets.setLimitsOpen(limitsOpen);
    if (generation === limitsGeneration) applyLimitsLayout(layout);
  } catch {
    let actual = null;
    try { if (window.codexPets.getLimitsLayout) actual = await window.codexPets.getLimitsLayout(); } catch {}
    if (generation === limitsGeneration) {
      limitsOpen = typeof actual?.open === 'boolean' ? actual.open : prior;
      updateLimitsVisibility();
      if (actual) applyLimitsLayout(actual);
      limitsButton.title = t("limitsToggleFailed");
    }
  } finally {if(generation === limitsGeneration)limitsChanging=false;}
}
async function initializeLimits(settings) {
  if (window.codexPets.onLimitsLayout) window.codexPets.onLimitsLayout(layout=>{
    if (!limitsChanging || layout.open === limitsOpen) applyLimitsLayout(layout);
  });
  if (window.codexPets.getLimitsLayout) {
    try {applyLimitsLayout(await window.codexPets.getLimitsLayout());} catch {}
  }
  limitsOpen = settings.limitsPanelOpen === true;
  updateLimitsVisibility();
}
async function requestLimitsRefresh() {
  if (!limitsOpen || limitsBusy) return;
  limitsRefreshOpenedAt = Date.now();
  limitsError = '';
  renderLimits();
  try {
    await window.codexPets.requestLimitsRefresh();
    void refreshLimits();
  } catch {
    limitsRefreshOpenedAt = 0;
    limitsError = t("refreshFailed");
    if (limitsOpen) renderLimits();
  }
}
limitsRefreshButton.addEventListener('click',()=>{void requestLimitsRefresh();});
limitsButton.addEventListener('click',()=>{void setLimitsOpen(!limitsOpen);});

document.getElementById("importPet").onclick = async event => {
  const button = event.currentTarget;
  const message = document.getElementById("importResult");
  button.disabled = true;
  message.textContent = "";
  try {
    const id = await window.codexPets.importPet();
    if (!id) return;
    pets.splice(0, pets.length, ...await window.codexPets.listPets());
    renderSkinGallery();
    await selectPet(id);
    if (settingsOpen) positionSettingsPopover();
  } catch {
    message.textContent = t("installPackError");
  } finally {
    button.disabled = false;
  }
};
document.getElementById("closeSettings").onclick = () => { setSettingsOpen(false); petElement.focus(); };
document.getElementById("openStatusTask").onclick = () => { if (consoleActiveTask) openConsoleTask(consoleActiveTask); };
for (const button of document.querySelectorAll("[data-preview]")) button.onclick = () => playOnce(button.dataset.preview);
for (const id of ["motionOptions","connectionOptions"]) document.getElementById(id).ontoggle = () => {
  if (settingsOpen) positionSettingsPopover();
};
providerSelect.addEventListener("change", () => {
  const wasManaged = managed;
  managed = providerSelect.value === "agent-console";
  provider = managed ? "json-status" : providerSelect.value;
  if (managed) statusFile = managedFile;
  else if (wasManaged) statusFile = "";
  statusFileInput.value = statusFile;
  updateProviderControls();
  window.codexPets.updateSettings({ provider, statusFile, customSource: !managed }).catch(console.error);
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshActivity().catch(console.error);
});
petSizeInput.addEventListener("input", () => {
  applyPetSize(petSizeInput.value);
});
petSizeInput.addEventListener("change", () => {
  window.codexPets.updateSettings({ petSize }).catch(console.error);
});
idleAnimationSelect.addEventListener("change", async () => {
  applyIdleAnimationMode(idleAnimationSelect.value);
  const revision = ++idleAnimationRevision;
  idleAnimationStatus.textContent = "";
  if (settingsOpen) positionSettingsPopover();
  try {
    const saved = await window.codexPets.updateSettings({ idleAnimationMode });
    savedIdleAnimationMode = saved.idleAnimationMode;
  } catch (error) {
    console.error(error);
    if (revision === idleAnimationRevision) {
      applyIdleAnimationMode(savedIdleAnimationMode);
      idleAnimationStatus.textContent = t("saveIdleError");
      if (settingsOpen) positionSettingsPopover();
    }
  }
});
statusFileInput.addEventListener("change", () => {
  statusFile = statusFileInput.value.trim();
  window.codexPets.updateSettings({ statusFile }).catch(console.error);
  refreshActivity().catch(console.error);
});
function applyTaskLabel(visible) {
  showTaskLabel = visible;
  const currentTask = document.getElementById("currentTask");
  currentTask.hidden = !visible || currentTask.dataset.empty === "true";
  document.getElementById("taskLabelToggle").checked = visible;
  syncMousePassthrough();
}
window.codexPets.onConsoleCommand(command => {
  if (command.action === "label") applyTaskLabel(command.value === true);
  if (command.action === "panel") setPopoverOpen(command.value === true);
  if (command.action === "limits") void setLimitsOpen(command.value === true);
  if (command.action === "settings") setSettingsOpen(true);
  if (command.action === "skin") selectPet(command.value);
  if (command.action === "error") {
    document.getElementById("consoleError").textContent = command.message;
    setPopoverOpen(true);
  }
});
document.getElementById("busyBubbleToggle").addEventListener("change", async event => {
  try {
    const saved = await window.codexPets.updateSettings({showBusyBubble:event.target.checked});
    showBusyBubble = saved.showBusyBubble !== false;
  } catch {
    document.getElementById("consoleError").textContent = t("saveBubbleError");
    setPopoverOpen(true);
  }
  updateBusyBubble();
  syncMousePassthrough();
});
document.getElementById("taskLabelToggle").addEventListener("change", async event => {
  const value = event.target.checked;
  try {
    const saved = await window.codexPets.updateSettings({showTaskLabel:value});
    applyTaskLabel(saved.showTaskLabel !== false);
  } catch {
    applyTaskLabel(showTaskLabel);
    document.getElementById("consoleError").textContent = t("saveTaskLabelError");
    setPopoverOpen(true);
  }
});
petStage.addEventListener("contextmenu", async event => {
  event.preventDefault();
  if (contextMenuOpen || (shape && event.target === petElement && !isPointInsideElement(event, petElement))) return;
  contextMenuOpen = true;
  setWindowMousePassthrough(false);
  try { await window.codexPets.showConsoleMenu({panelOpen:popoverOpen}); }
  finally { contextMenuOpen = false; syncMousePassthrough(); }
});
petElement.addEventListener("pointerdown", event => {
  if (event.button === 0 && isPointInsideElement(event, petElement))
    petElement.setPointerCapture(event.pointerId);
});
petElement.addEventListener("lostpointercapture", event => {
  if (petDragging) endPetDrag(event);
});
petStage.addEventListener("mousedown", beginPetDrag);
petElement.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!event.repeat) wakeIdle();
    setSettingsOpen(true);
    document.querySelector('.skin-card[aria-pressed="true"]')?.focus();
  }
});
settingsButton.addEventListener("click", () => setSettingsOpen(!settingsOpen));
document.addEventListener("keydown", event => {
  if (event.key === "Tab") { keyboardNavigation = true; updateActions(); }
});
document.addEventListener("pointerdown", () => { keyboardNavigation = false; });
document.addEventListener("focusin", updateActions);
document.addEventListener("focusout", () => queueMicrotask(updateActions));
threadBadge.addEventListener("click", () => setPopoverOpen(true, true));
collapseTasks.addEventListener("click", () => setPopoverOpen(false, true));
document.addEventListener("pointerdown", event => {
  if (popoverOpen && !threadPopover.contains(event.target) &&
      !limitsButton.contains(event.target) && !settingsButton.contains(event.target) &&
      !limitsPopover.contains(event.target)) setPopoverOpen(false);
});
window.addEventListener("blur", () => {
  if (popoverOpen && !petDragging && !contextMenuOpen) setPopoverOpen(false);
});
window.addEventListener("mousemove", (event) => {
  updatePetDrag(event);
  updateMousePassthrough(event);
});
window.addEventListener("mouseleave", () => {
  if (petDragging) return;
  controlDragging = false;
  lastPointer = null;
  updateActions();
  petStage.classList.remove("is-dragging");
  setWindowMousePassthrough(true);
});
window.addEventListener("mousedown", event => {
  if (event.button === 0 && settingsOpen && event.target.matches('input[type="range"]')) {
    controlDragging = true;
    setWindowMousePassthrough(false);
  }
});
window.addEventListener("mouseup", event => {
  controlDragging = false;
  endPetDrag(event);
  updateMousePassthrough(event);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (popoverOpen) {
      setPopoverOpen(false, true);
      return;
    }
    setSettingsOpen(false);
    if (limitsOpen) void setLimitsOpen(false);
  }
});
window.addEventListener("focus", () => refreshActivity().catch(console.error));
window.addEventListener("resize", () => {
  fitPetShape();
  if (settingsOpen) positionSettingsPopover();
  positionLimits();
  syncMousePassthrough();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshActivity().catch(console.error);
});

boot().catch((error) => {
  console.error(error);
});
setWindowMousePassthrough(true);
