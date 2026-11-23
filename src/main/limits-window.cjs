"use strict";
const fs = require('node:fs/promises');
const path = require('node:path');
const PANEL_WIDTH = 304;
const SETTINGS_VIEWPORT_HEIGHT = 608;
const MAX_SNAPSHOT_BYTES = 128 * 1024;

async function readLimitsSnapshot(userData) {
    const filename = path.join(userData, 'limits.json');
    let file;
    try {
        file = await fs.open(filename, 'r');
        const buffer = Buffer.alloc(MAX_SNAPSHOT_BYTES + 1);
        let size = 0;
        while (size < buffer.length) {
            const {bytesRead} = await file.read(buffer, size, buffer.length - size, null);
            if (!bytesRead) break;
            size += bytesRead;
        }
        if (size > MAX_SNAPSHOT_BYTES) return null;
        const snapshot = JSON.parse(buffer.subarray(0, size).toString('utf8'));
        return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : null;
    } catch { return null; }
    finally { if (file) await file.close().catch(() => {}); }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
function calculateLayout(base, open, area, petSize = 112, settingsOpen = false) {
    const baseWidth = Math.min(base.width, area.width);
    const height = Math.min(base.height, area.height);
    const center = base.x + base.width / 2;
    let baseX = Math.round(center - baseWidth / 2);
    if (center < area.x || center > area.x + area.width)
        baseX = clamp(baseX, area.x, area.x + area.width - baseWidth);
    let y = base.y + base.height - height;
    const anchorY = y + height - 67 - petSize / 2;
    if (anchorY < area.y || anchorY > area.y + area.height)
        y = clamp(y, area.y, area.y + area.height - height);

    // Reserve panel space before the first renderer frame. The native window
    // and the painted avatar must keep the same origin across panel toggles.
    const panelWidth = Math.min(PANEL_WIDTH, Math.max(Math.floor(area.width / 2), Math.min(196, area.width - 160)));
    const petOffset = open ? Math.max(0, Math.min(panelWidth, Math.floor((area.width - baseWidth) / 2))) : 0;
    const width = baseWidth + 2 * petOffset;
    const x = baseX - petOffset;
    const windowHeight = open ? Math.min(area.height, Math.max(height, SETTINGS_VIEWPORT_HEIGHT)) : height;
    const windowY = open ? clamp(y - Math.floor((windowHeight - height) / 2), area.y, area.y + area.height - windowHeight) : y;
    return {
        layout: {open, settingsOpen, baseWidth, baseHeight:height, petOffset,
            petBottomOffset:windowY + windowHeight - y - height, panelWidth:open ? panelWidth : 0,
            panelLeft:petOffset + baseWidth,
            clipLeft:Math.max(0,area.x-baseX), clipRight:Math.max(0,baseX+baseWidth-area.x-area.width),
            clipTop:Math.max(0,area.y-windowY), clipBottom:Math.max(0,windowY+windowHeight-area.y-area.height),
            visibleLeft:Math.max(0,area.x-x), visibleRight:Math.min(width,area.x+area.width-x),
            width, height:windowHeight},
        bounds: {x, y:windowY, width, height:windowHeight},
    };
}

function createLimitsWindow(win, screen, initialOpen, persist, options = {}) {
    const petSize = Number.isFinite(options.petSize) ? options.petSize : 112;
    let base = win.getBounds();
    let open = initialOpen === true;
    let settingsOpen = false;
    let layout;
    let appliedBounds = win.getBounds();
    let applying = false;
    let saveTimer = null;
    let writes = Promise.resolve();
    let minWidth = 0;
    let minHeight = 0;
    const getLayout = () => ({...layout});
    const getBaseBounds = () => ({...base});
    const enqueue = operation => {
        const next = writes.catch(() => {}).then(operation);
        writes = next;
        return next;
    };
    const clearSaveTimer = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
    };
    const save = () => {
        clearSaveTimer();
        // Read state when the queued operation runs, after any pending toggle.
        return enqueue(() => persist({limitsPanelOpen:open, windowBounds:getBaseBounds()}));
    };
    const apply = () => {
        const area = screen.getDisplayMatching(base).workArea;
        base = calculateLayout(base, false, area, petSize).bounds;
        // Reserve the transparent drawer area before the renderer loads. A toggle
        // must not move the native origin and the avatar in separate frames.
        const next = calculateLayout(base, true, area, petSize, settingsOpen);
        layout = {...next.layout, open};
        applying = true;
        try {
            const minimum = Math.min(area.width, 220 + 2 * layout.panelWidth);
            const minimumHeight = Math.min(460, next.bounds.height);
            if (minimum !== minWidth || minimumHeight !== minHeight) {
                minWidth = minimum;
                minHeight = minimumHeight;
                win.setMinimumSize(minWidth, minHeight);
            }
            appliedBounds = next.bounds;
            const actual = win.getBounds();
            if (Object.keys(next.bounds).some(key => next.bounds[key] !== actual[key]))
                win.setBounds(next.bounds, false);
        } finally { applying = false; }
        win.webContents.send('limits:layout', getLayout());
    };
    const scheduleSave = () => {
        clearSaveTimer();
        saveTimer = setTimeout(() => { save().catch(() => {}); }, 300);
    };
    const movedOrResized = () => {
        if (applying) return;
        const actual = win.getBounds();
        if (actual.x === appliedBounds.x && actual.y === appliedBounds.y &&
            actual.width === appliedBounds.width && actual.height === appliedBounds.height) return;
        // Ignore native DPI rounding on a translation. An actual resize changes
        // the compact size about the new centre, independently of drawer state.
        const resized = Math.abs(actual.width - appliedBounds.width) > 2;
        const width = resized ? Math.max(220, actual.width - 2 * layout.petOffset) : base.width;
        base = {
            x: resized ? Math.round(actual.x + (actual.width - width) / 2) : base.x + actual.x - appliedBounds.x,
            y: base.y + actual.y - appliedBounds.y,
            width,
            height: Math.abs(actual.height - appliedBounds.height) > 2 ? actual.height : base.height,
        };
        appliedBounds = actual;
        apply();
        scheduleSave();
    };
    win.on('move', movedOrResized);
    win.on('resize', movedOrResized);
    win.on('close', () => { save().catch(() => {}); });
    apply();
    return {
        getLayout,
        getBaseBounds,
        readSnapshot: options.readSnapshot,
        setSource: options.setSource,
        setBasePosition(x, y) {
            if (base.x === x && base.y === y) return;
            base = {...base, x, y};
            apply();
            scheduleSave();
        },
        setSettingsOpen(value) {
            if (typeof value !== 'boolean') throw new TypeError('Expected a boolean settings state');
            if (settingsOpen !== value) {
                settingsOpen = value;
                layout = {...layout, settingsOpen};
                win.webContents.send('limits:layout', getLayout());
            }
            return getLayout();
        },
        requestRefresh() {
            if (!open) throw new Error('Limits panel is closed');
            if (!options.onRefresh || options.onRefresh() !== true) throw new Error('Limits bridge unavailable');
            return {requested:true};
        },
        async setOpen(value) {
            if (typeof value !== 'boolean') throw new TypeError('Expected a boolean limits state');
            clearSaveTimer();
            return enqueue(async () => {
                const area = screen.getDisplayMatching(base).workArea;
                const desiredBase = value ? getBaseBounds() : calculateLayout(base, false, area, petSize).bounds;
                // Failure leaves both geometry and emitted state untouched. A later
                // queued intent still runs even if this persistence attempt rejects.
                await persist({limitsPanelOpen:value, windowBounds:desiredBase});
                const opening = value && !open;
                open = value;
                layout = {...layout, open};
                win.webContents.send('limits:layout', getLayout());
                if (opening && options.onRefresh) {
                    // Refresh is optional and must not make a committed UI toggle fail.
                    try { options.onRefresh(); } catch {}
                }
                return getLayout();
            });
        },
    };
}
module.exports = {createLimitsWindow, calculateLayout, readLimitsSnapshot};
