"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateLayout, createLimitsWindow } = require("../src/main/limits-window.cjs");
const { normalizeQuota, createCodexLimits } = require("../src/main/providers/codex-limits.cjs");
const { normalizeSettings } = require("../src/main/settings");
const { normalizeGoLimits } = require("../src/main/providers/opencode-limits.cjs");

test("the settings overlay reserves visible height without moving or resizing Kitsu", () => {
  const base = {x:-1500,y:-220,width:360,height:520};
  const monitor = {x:-1920,y:0,width:1920,height:1040};
  for (const size of [160,360]) {
    const closed = calculateLayout(base, true, monitor, size);
    const opened = calculateLayout(base, true, monitor, size, true);
    const petCenter = ({bounds,layout}) => [bounds.x + layout.petOffset + layout.baseWidth / 2,
      bounds.y + bounds.height - layout.petBottomOffset];
    assert.deepEqual(petCenter(opened), petCenter(closed));
    assert.deepEqual(opened.bounds, closed.bounds);
    assert.equal(opened.layout.baseHeight, closed.layout.baseHeight);
    assert.equal(opened.bounds.y, monitor.y);
    assert.equal(opened.bounds.height, 608);
  }
});

test("the limits button keeps the opt-out and defaults older profiles to automatic", () => {
  assert.equal(normalizeSettings({}).limitsButtonVisibility,"auto");
  assert.equal(normalizeSettings({limitsButtonVisibility:"hidden"}).limitsButtonVisibility,"hidden");
});

test("Codex quotas use the multi-bucket response when available and retain real zeroes", () => {
  const now = new Date("2026-11-23T09:00:00Z");
  const valid = {usedPercent:100,windowDurationMins:300,resetsAt:(+now+60_000)/1000};
  const windows = normalizeQuota({rateLimits:{primary:{usedPercent:50}},rateLimitsByLimitId:{
    codex:{primary:valid,secondary:{usedPercent:null}}, other:{limitName:"Another bucket",primary:{...valid,resetsAt:+now/1000-1}},
  }},now);
  assert.deepEqual(windows.map(({id,remaining_percent,status})=>[id,remaining_percent,status]),[
    ["codex:primary",0,"known"],["other:primary",0,"expired"],
  ]);
  assert.equal(normalizeQuota({rateLimits:{primary:valid}},now).length,1);
});

test("an unavailable Codex refresh keeps the last snapshot and concurrent requests share one read", async () => {
  const window = {remaining_percent:31};
  let calls = 0;
  const source = createCodexLimits("codex","fake-home",async () => {
    if (++calls === 1) return [window];
    throw new Error("offline");
  });
  const settle = () => new Promise(resolve=>setImmediate(resolve));
  source.refresh();
  source.refresh();
  await settle();
  assert.equal(calls,1);
  assert.equal(source.read().refresh.state,"success");
  source.refresh();
  await settle();
  assert.equal(source.read().refresh.state,"error");
  assert.deepEqual(source.read().providers[0].windows,[window]);
});

test("OpenCode Go maps each allowance and respects the server's limiting state", () => {
  const now = new Date("2026-11-23T09:00:00Z");
  const future = +now + 3600_000;
  const windows = normalizeGoLimits({
    rolling:{percent:67,limited:true,resetsAt:future},
    weekly:{percent:50,limited:false,resetsAt:+now-1},
    monthly:{percent:0,limited:false},
  },now);
  assert.deepEqual(windows.map(({kind,remaining_percent,status})=>[kind,remaining_percent,status]),[
    ["five_hour",0,"known"],["seven_day",50,"expired"],["month",100,"known"],
  ]);
  assert.equal(windows[0].resets_at,new Date(future).toISOString());
  assert.deepEqual(normalizeGoLimits(null),[]);
});

test("cold startup preserves compact bounds after Windows scales the native frame", async () => {
  const saved = {x:1370, y:-407, width:1501, height:1392};
  let frame = {...saved, width:1504, height:1396};
  const win = {
    getBounds: () => ({...frame}),
    setBounds: bounds => { frame = {...bounds}; },
    setMinimumSize() {}, on() {}, webContents: {send() {}},
  };
  const screen = {getDisplayMatching: () => ({workArea:{x:0, y:0, width:2560, height:1392}})};
  let persisted;
  const controller = createLimitsWindow(win, screen, false, patch => { persisted = patch; },
    {savedBounds:saved, petSize:196});
  assert.deepEqual(controller.getBaseBounds(), saved);
  assert.deepEqual(frame, calculateLayout(saved, true, screen.getDisplayMatching().workArea, 196).bounds);
  await controller.setOpen(true);
  assert.deepEqual(persisted.windowBounds, saved);
});
