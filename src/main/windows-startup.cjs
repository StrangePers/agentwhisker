"use strict";
const net = require("node:net");
const os = require("node:os");
const {createHash} = require("node:crypto");

const loginArgs = ["--login-start"];
function loginSetting(app, value) {
    if (process.platform !== "win32" || !app.isPackaged) return null;
    const options = {path:process.execPath, args:loginArgs};
    if (typeof value === "boolean") {
        app.setLoginItemSettings({...options, name:"AgentWhisker", openAtLogin:value, enabled:value});
    }
    const {launchItems} = app.getLoginItemSettings(options);
    return launchItems.some(item => item.name === "AgentWhisker" && item.enabled && item.scope === "user" &&
        item.path.toLowerCase() === process.execPath.toLowerCase());
}

// Console owns its bridge and PID. An automatically started standalone pet
// yields even when Console uses a separate Electron profile.
async function coordinateStartup(app, role, hideLogin) {
    if (process.platform !== "win32" || !role) return true;
    const key = createHash("sha256").update([os.homedir(), process.execPath].join("|").toLowerCase()).digest("hex").slice(0,24);
    const pipe = name => "\\\\.\\pipe\\AgentWhisker-" + key + "-" + name;
    let yielding = false;
    const server = net.createServer(socket => {
        socket.on("error", () => {});
        if (role === "login") {
            yielding = true;
            hideLogin();
        }
        socket.end("ready", () => { if (yielding) app.quit(); });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(pipe(role), resolve);
    });
    app.once("will-quit", () => server.close());
    const peerPresent = await new Promise(resolve => {
        const socket = net.createConnection(pipe(role === "login" ? "console" : "login"));
        let connected = false;
        socket.on("connect", () => { connected = true; });
        socket.on("data", () => {});
        socket.on("error", () => {});
        socket.on("close", () => resolve(connected));
        socket.setTimeout(1500, () => socket.destroy());
    });
    return role === "console" || (!peerPresent && !yielding);
}
module.exports = {loginSetting, coordinateStartup};
