"use strict";

const NEAR_WINDOW_MS = 45;
const AWAY_FROM_WINDOW_MS = 160;
const PROXIMITY = 90;

function createLinuxPointerForwarder(win, screen) {
    let active = false;
    let timer;
    let lastPoint = null;

    function stop() {
        clearTimeout(timer);
        timer = undefined;
        lastPoint = null;
    }

    function sample() {
        timer = undefined;
        if (!active || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
        const {x, y} = screen.getCursorScreenPoint();
        const bounds = win.getContentBounds();
        const clientX = x - bounds.x;
        const clientY = y - bounds.y;
        const inside = clientX >= 0 && clientY >= 0 && clientX < bounds.width && clientY < bounds.height;
        const point = inside ? {clientX, clientY} : null;
        if (point?.clientX !== lastPoint?.clientX || point?.clientY !== lastPoint?.clientY) {
            lastPoint = point;
            win.webContents.send("window:forwarded-pointer", point);
        }
        const near = clientX >= -PROXIMITY && clientY >= -PROXIMITY &&
            clientX < bounds.width + PROXIMITY && clientY < bounds.height + PROXIMITY;
        timer = setTimeout(sample, near ? NEAR_WINDOW_MS : AWAY_FROM_WINDOW_MS).unref();
    }

    win.on("hide", stop);
    win.on("minimize", stop);
    win.on("show", () => { if (!timer) sample(); });
    win.on("restore", () => { if (!timer) sample(); });
    win.once("closed", stop);
    return enabled => {
        if (active === enabled) return;
        active = enabled;
        if (active) sample();
        else stop();
    };
}

module.exports = {createLinuxPointerForwarder};
