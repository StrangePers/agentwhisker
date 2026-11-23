"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.getCodexHome = getCodexHome;
exports.createWindow = createWindow;
exports.destroyTray = destroyTray;
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const path = __importStar(require("node:path"));
const activity_1 = require("./main/activity");
const providers_1 = require("./main/providers");
const settings_1 = require("./main/settings");
const validate_pet_1 = require("./main/validate-pet");

const limits_window = require("./main/limits-window.cjs");
const { findCodexExecutable, createCodexLimits } = require("./main/providers/codex-limits.cjs");
const { createOpenCodeLimits } = require("./main/providers/opencode-limits.cjs");
const { listCharacters, importCharacter } = require("./main/character-library.cjs");
const limitsWindows = new WeakMap();
let appTray = null;
function parseArgs(argv) {
    const args = {
        pet: null,
        state: null,
        list: false,
        codexHome: null,
        statusFile: null,
        provider: null,
        petSize: null,
        validatePet: null,
        userDataDir: null,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--list")
            args.list = true;
        else if (arg === "--validate-pet")
            args.validatePet = argv[++index] ?? null;
        else if (arg.startsWith("--validate-pet="))
            args.validatePet = arg.slice("--validate-pet=".length);
        else if (arg === "--pet")
            args.pet = argv[++index] ?? null;
        else if (arg.startsWith("--pet="))
            args.pet = arg.slice("--pet=".length);
        else if (arg === "--state")
            args.state = argv[++index] ?? "idle";
        else if (arg.startsWith("--state="))
            args.state = arg.slice("--state=".length);
        else if (arg === "--codex-home")
            args.codexHome = argv[++index] ?? null;
        else if (arg.startsWith("--codex-home="))
            args.codexHome = arg.slice("--codex-home=".length);
        else if (arg === "--status-file")
            args.statusFile = argv[++index] ?? null;
        else if (arg.startsWith("--status-file="))
            args.statusFile = arg.slice("--status-file=".length);
        else if (arg === "--provider")
            args.provider = argv[++index] ?? null;
        else if (arg.startsWith("--provider="))
            args.provider = arg.slice("--provider=".length);
        else if (arg === "--pet-size")
            args.petSize = argv[++index] ?? null;
        else if (arg.startsWith("--pet-size="))
            args.petSize = arg.slice("--pet-size=".length);
        else if (arg === "--user-data-dir")
            args.userDataDir = argv[++index] ?? null;
        else if (arg.startsWith("--user-data-dir="))
            args.userDataDir = arg.slice("--user-data-dir=".length);
    }
    return args;
}
function getCodexHome(args) {
    return path.resolve(args.codexHome || process.env.CODEX_HOME || path.join(electron_1.app.getPath("home"), ".codex"));
}
const { chooseLocale, translator } = require("./locale");
let labels = translator("en");
const t = (key, values) => labels.t(key, values);
function useLocale(preference) {
    labels = translator(chooseLocale(preference, ...electron_1.app.getPreferredSystemLanguages()));
}

async function createWindow(args) {
    const codexHome = getCodexHome(args);
    const settingsPath = path.join(electron_1.app.getPath("userData"), "settings.json");
    const settings = await (0, settings_1.readSettings)(settingsPath);
    useLocale(settings.locale);
    const pets = await listCharacters();
    if (args.validatePet) {
        const result = await (0, validate_pet_1.validatePetPackage)(args.validatePet);
        console.log(JSON.stringify(result, null, 2));
        electron_1.app.exit(result.ok ? 0 : 1);
        return;
    }
    if (args.list) {
        for (const pet of pets)
            console.log(`${pet.id}\t${pet.displayName}\t${pet.spritesheetPath}`);
        electron_1.app.quit();
        return;
    }
    const selectedPetId = args.pet || settings.selectedPetId;
    const selected = pets.find((pet) => pet.id === selectedPetId) || pets.find(pet => pet.id === "kitsu") || null;
    const managedFile = process.env.AGENT_CONSOLE_PET_PYTHON && args.statusFile || "";
    const firstConnection = !args.provider && !args.statusFile && !process.env.AGENT_CONSOLE_PET_PYTHON &&
        !require("node:fs").existsSync(settingsPath);
    const restoreSource = managedFile && settings.customSource;
    const effectiveSettings = await (0, settings_1.updateSettings)(settingsPath, {
        selectedPetId: selected?.id || settings.selectedPetId,
        selectedState: (args.state || "auto"),
        provider: restoreSource ? settings.provider : (args.provider || (args.statusFile ? "json-status" : settings.provider || "desktop")),
        petSize: args.petSize ? Number(args.petSize) : settings.petSize,
        statusFile: restoreSource ? settings.statusFile : args.statusFile || settings.statusFile || "",
    });
    const bounds = settings.windowBounds || {};
    const win = new electron_1.BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width || 360,
        height: bounds.height || 520,
        minWidth: 220,
        minHeight: 460,
        icon: path.join(__dirname,"assets","agentwhisker.ico"),
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    win.setAlwaysOnTop(true, "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    let limitsBridge = null;
    const codexExecutable = managedFile ? null : findCodexExecutable();
    const nativeLimits = new Map();
    if (!managedFile) {
        if (codexExecutable) nativeLimits.set("codex", createCodexLimits(codexExecutable, codexHome));
        nativeLimits.set("opencode", createOpenCodeLimits());
    }
    let limitsProvider = effectiveSettings.provider;
    const startWithLimits = effectiveSettings.limitsPanelOpen && effectiveSettings.limitsButtonVisibility !== "hidden" &&
        Boolean(managedFile || nativeLimits.has(limitsProvider));
    const readSnapshot = managedFile ? () => limits_window.readLimitsSnapshot(electron_1.app.getPath("userData"))
        : () => nativeLimits.get(limitsProvider)?.read() || null;
    limitsWindows.set(win, limits_window.createLimitsWindow(win, electron_1.screen, startWithLimits,
        patch => (0, settings_1.updateSettings)(settingsPath, patch), {petSize:effectiveSettings.petSize, readSnapshot,
        setSource: value => { limitsProvider = value; }, onRefresh:() => {
            if (!managedFile) return nativeLimits.get(limitsProvider)?.refresh() === true;
            if (!limitsBridge || limitsBridge.exitCode !== null || limitsBridge.stdin.destroyed || !limitsBridge.stdin.writable)
                return false;
            limitsBridge.stdin.write("R", () => {});
            return true;
        }}));
    if (startWithLimits) nativeLimits.get(limitsProvider)?.refresh();
    wireTray(win);
    electron_1.app.on("second-instance", () => { win.show(); win.focus(); });
    const childProcess = require("node:child_process");
    const fileSystem = require("node:fs");
    const python = process.env.AGENT_CONSOLE_PET_PYTHON;
    if (python && args.statusFile) {
        const bridge = childProcess.spawn(python, ["-B", "-P", "-m", "agent_console.pet_status", "--parent-stdin", "--status-file", args.statusFile],
            { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
        limitsBridge = bridge;
        bridge.stdin.on("error", () => {});
        electron_1.app.once("before-quit", () => { if (bridge.exitCode === null) bridge.stdin.end(); });
    }
    const requestPath = path.join(electron_1.app.getPath("userData"), "stop-request");
    const showPath = path.join(electron_1.app.getPath("userData"), "show-request");
    const stopTimer = setInterval(() => {
        if (fileSystem.existsSync(showPath)) {
            fileSystem.unlinkSync(showPath);
            win.show();
            win.focus();
            win.webContents.send("console:command", { action: "panel", value: true });
        }
        if (fileSystem.existsSync(requestPath)) {
            fileSystem.unlinkSync(requestPath);
            electron_1.app.quit();
        }
    }, 400);
    electron_1.app.once("before-quit", () => clearInterval(stopTimer));
    win.loadFile(path.join(__dirname, "renderer.html"), {
        query: {
            firstConnection: firstConnection ? "1" : "",
            codexHome,
            locale: labels.locale,
            statusFile: effectiveSettings.statusFile,
            managed: managedFile && !restoreSource ? "1" : "",
            managedFile,
            nativeLimits: [...nativeLimits.keys()].join(","),
            provider: effectiveSettings.provider,
            petSize: String(effectiveSettings.petSize),
            state: effectiveSettings.selectedState,
            pet: selected?.id || "",
        },
    });
}
function wireTray(win) {
    destroyTray();
    try {
        const iconFile = process.platform === "win32" ? "tray.ico" : "tray.png";
        appTray = new electron_1.Tray(path.join(__dirname, "assets", iconFile));
    }
    catch {
        return;
    }
    appTray.setToolTip("AgentWhisker");
    appTray.on("click", () => { win.show(); win.focus(); });
    updateTrayMenu(win);
    win.once("closed", destroyTray);
    electron_1.app.once("before-quit", destroyTray);
}
function updateTrayMenu(win) {
    if (!appTray || !win || win.isDestroyed()) return;
    appTray.setContextMenu(electron_1.Menu.buildFromTemplate([
        { label: t("showApp"), click: () => win.show() },
        { label: t("hideApp"), click: () => win.hide() },
        { type: "separator" },
        { label: t("quitApp"), click: () => electron_1.app.quit() },
    ]));
}
function destroyTray() {
    if (!appTray)
        return;
    appTray.destroy();
    appTray = null;
}
function openConsole(taskId) {
    if (taskId !== undefined && taskId !== null && !/^[0-9a-f]{32}$/.test(taskId)) {
        return Promise.reject(new Error("Invalid task ID"));
    }
    const python = process.env.AGENT_CONSOLE_PET_PYTHON;
    if (!python) return Promise.reject(new Error("Console runtime is unavailable"));
    const args = ["-B", "-P", "-m", "agent_console.pet_control", "open"];
    if (taskId) args.push("--task", taskId);
    return new Promise((resolve, reject) => {
        require("node:child_process").execFile(python, args, {windowsHide:true, timeout:35000}, error => {
            if (error) reject(new Error(t("consoleOpenFailed")));
            else resolve();
        });
    });
}
function registerIpcHandlers(startupArgs = {}) {
    electron_1.ipcMain.handle("limits:read", async (event, ...args) => {
        if (args.length) throw new TypeError("readLimits accepts no arguments");
        return limitsForEvent(event).readSnapshot();
    });
    const limitsForEvent = event => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed() || !limitsWindows.has(win)) throw new Error("Pet window unavailable");
        return limitsWindows.get(win);
    };
    electron_1.ipcMain.handle("limits:refresh", (event, ...args) => {
        if (args.length) throw new TypeError("Limits refresh accepts no arguments");
        return limitsForEvent(event).requestRefresh();
    });
    electron_1.ipcMain.handle("limits:set-open", (event, value) => limitsForEvent(event).setOpen(value));
    electron_1.ipcMain.handle("limits:get-layout", event => limitsForEvent(event).getLayout());
    electron_1.ipcMain.handle("settings:set-panel-open", (event, value) => limitsForEvent(event).setSettingsOpen(value));
    electron_1.ipcMain.handle("console:open", (_event, taskId) => openConsole(taskId));
    electron_1.ipcMain.handle("console:menu", async (event, state) => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;
        const settingsPath = path.join(electron_1.app.getPath("userData"), "settings.json");
        const settings = await (0, settings_1.readSettings)(settingsPath);
        const send = command => { if (!win.isDestroyed()) win.webContents.send("console:command", command); };
        const menu = electron_1.Menu.buildFromTemplate([
            { label: t("taskPanel"), type: "checkbox", checked: state?.panelOpen === true,
              click: item => send({action:"panel", value:item.checked}) },
            { label: t("usageLimits"), visible:state?.limitsAvailable === true, type: "checkbox", checked: settings.limitsPanelOpen === true,
              click: item => send({action:"limits", value:item.checked}) },
            { label: t("petSettings"), click: () => send({action:"settings"}) },
            { type: "separator" },
            { label: t("showConsole"), visible:Boolean(process.env.AGENT_CONSOLE_PET_PYTHON), click: () => {
                openConsole().catch(() => send({action:"error", message:t("openConsoleAgain")}));
              }},
            { type: "separator" },
            { label: t("hideApp"), click: () => win.hide() },
            { label: t("quitApp"), click: () => electron_1.app.quit() },
        ]);
        win.setIgnoreMouseEvents(false);
        await new Promise(resolve => menu.popup({window:win, callback:resolve}));
    });
    electron_1.ipcMain.on("console:hide", event => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) { win.setSkipTaskbar(false); win.hide(); }
    });
    electron_1.ipcMain.on("console:quit", () => electron_1.app.quit());
    electron_1.ipcMain.handle("pets:list", () => listCharacters());
    electron_1.ipcMain.handle("pets:import", async event => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        const result = await electron_1.dialog.showOpenDialog(win, {
            title:t("installCharacter"), properties:["openFile"],
            filters:[{name:t("packFilter"),extensions:["whiskerpack","folkpack","pippack","wisppack"]}]
        });
        if (result.canceled || !result.filePaths.length) return null;
        return importCharacter(result.filePaths[0]);
    });
    electron_1.ipcMain.handle("providers:list", async () => (0, providers_1.listProviders)());
    const {projectFolder} = require("./main/project-folder.cjs");
    electron_1.ipcMain.handle("activity:read", async (_event, options) => {
        const activity = await (0, activity_1.readActivity)(options);
        if (activity.source === "codex") {
            await Promise.all(activity.sessions.map(async session => {
                session.canOpenFolder = Boolean(await projectFolder(session));
            }));
        }
        return activity;
    });
    electron_1.ipcMain.handle("project:open-folder", async (_event, sessionId) => {
        if (typeof sessionId !== "string" || !sessionId) return false;
        const activity = await (0, activity_1.readActivity)({provider:"codex", codexHome:getCodexHome(startupArgs)});
        const session = activity.sessions.find(item => item.id === sessionId);
        const folder = session && await projectFolder(session);
        return Boolean(folder) && (await electron_1.shell.openPath(folder)) === "";
    });
    electron_1.ipcMain.handle("status:choose-file", async event => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        const result = await electron_1.dialog.showOpenDialog(win, {properties:["openFile"], filters:[{name:"JSON", extensions:["json"]}]});
        return result.canceled ? null : result.filePaths[0];
    });
    electron_1.ipcMain.handle("sources:discover", (_event, codexHome) =>
        require("./main/providers/discover.cjs").discoverSources(codexHome));
    electron_1.ipcMain.handle("settings:get", async () => (0, settings_1.readSettings)(path.join(electron_1.app.getPath("userData"), "settings.json")));
    electron_1.ipcMain.handle("settings:update", async (event, patch) => {
        if (patch && Object.hasOwn(patch, "provider")) limitsForEvent(event).setSource((0, providers_1.normalizeProvider)(patch.provider));
        const saved = await (0, settings_1.updateSettings)(path.join(electron_1.app.getPath("userData"), "settings.json"), patch);
        if (patch && Object.hasOwn(patch, "locale")) {
            useLocale(saved.locale);
            updateTrayMenu(electron_1.BrowserWindow.fromWebContents(event.sender));
            return { ...saved, effectiveLocale: labels.locale };
        }
        return saved;
    });
    electron_1.ipcMain.on("window:set-ignore-mouse-events", (event, ignore, options) => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed())
            return;
        win.setIgnoreMouseEvents(Boolean(ignore), ignore ? options : undefined);
    });
    const grabs = new WeakMap();
    electron_1.ipcMain.on("window:drag", (event, phase, x, y) => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;
        if (phase === "end") { grabs.delete(win); return; }
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (phase === "start") {
            const origin = limitsForEvent(event).getBaseBounds();
            grabs.set(win, {x:origin.x - x, y:origin.y - y});
        } else if (phase === "move" && grabs.has(win)) {
            const offset = grabs.get(win);
            limitsForEvent(event).setBasePosition(Math.round(x + offset.x), Math.round(y + offset.y));
        }
    });
    electron_1.ipcMain.on("window:move-by", (event, deltaX, deltaY) => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed())
            return;
        const windowLayout = limitsForEvent(event);
        const {x, y} = windowLayout.getBaseBounds();
        const dx = Number(deltaX || 0), dy = Number(deltaY || 0);
        if (Number.isFinite(dx) && Number.isFinite(dy)) windowLayout.setBasePosition(Math.round(x + dx), Math.round(y + dy));
    });
}
if (process.versions.electron && process.type === "browser") {
    const startupArgs = parseArgs(process.argv.slice(process.defaultApp ? 2 : 1));
    if (startupArgs.userDataDir)
        electron_1.app.setPath("userData", path.resolve(startupArgs.userDataDir));
    if (!electron_1.app.requestSingleInstanceLock()) { electron_1.app.quit(); } else {
    registerIpcHandlers(startupArgs);
    electron_1.app.whenReady().then(() => createWindow(startupArgs));
    electron_1.app.on("window-all-closed", () => electron_1.app.quit());
    }
}
