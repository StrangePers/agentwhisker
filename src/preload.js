"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("codexPets", {
    requestLimitsRefresh: () => electron_1.ipcRenderer.invoke("limits:refresh"),
    readLimits: () => electron_1.ipcRenderer.invoke("limits:read"),
    setLimitsOpen: value => electron_1.ipcRenderer.invoke("limits:set-open", value),
    getLimitsLayout: () => electron_1.ipcRenderer.invoke("limits:get-layout"),
    onLimitsLayout: callback => {
        const listener = (_event, layout) => callback(layout);
        electron_1.ipcRenderer.on("limits:layout", listener);
        return () => electron_1.ipcRenderer.removeListener("limits:layout", listener);
    },
    showConsoleMenu: (state) => electron_1.ipcRenderer.invoke("console:menu", state),
    onConsoleCommand: callback => {
        const listener = (_event, command) => callback(command);
        electron_1.ipcRenderer.on("console:command", listener);
        return () => electron_1.ipcRenderer.removeListener("console:command", listener);
    },
    openConsole: (taskId) => electron_1.ipcRenderer.invoke("console:open", taskId),
    hidePet: () => electron_1.ipcRenderer.send("console:hide"),
    quitPet: () => electron_1.ipcRenderer.send("console:quit"),
    importPet: () => electron_1.ipcRenderer.invoke("pets:import"),
    listPets: (codexHome) => electron_1.ipcRenderer.invoke("pets:list", codexHome),
    listProviders: () => electron_1.ipcRenderer.invoke("providers:list"),
    readActivity: (options) => electron_1.ipcRenderer.invoke("activity:read", options),
    getSettings: () => electron_1.ipcRenderer.invoke("settings:get"),
    updateSettings: (patch) => electron_1.ipcRenderer.invoke("settings:update", patch),
    setIgnoreMouseEvents: (ignore, options) => electron_1.ipcRenderer.send("window:set-ignore-mouse-events", ignore, options),
    dragWindow: (phase, x, y) => electron_1.ipcRenderer.send("window:drag", phase, x, y),
    moveWindowBy: (deltaX, deltaY) => electron_1.ipcRenderer.send("window:move-by", deltaX, deltaY),
});
