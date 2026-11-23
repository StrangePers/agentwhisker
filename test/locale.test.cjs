"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { chooseLocale, normalizeLocale, translator } = require("../src/locale");
const { normalizeSettings } = require("../src/main/settings");

test("language preference follows supported system locales and falls back safely", () => {
  assert.equal(chooseLocale("ru", "es-MX"), "es");
  assert.equal(chooseLocale("ru", "de"), "en");
  assert.equal(chooseLocale("hi-IN", "en-GB"), "hi");
  assert.equal(normalizeLocale("zh-Hans"), "zh-CN");
  assert.equal(normalizeLocale({}), "");
  assert.equal(normalizeSettings({ petSize: 160 }).locale, "");
  const saved = normalizeSettings({ locale: "es-AR", petSize: 360, idleAnimationMode: "events-only" });
  assert.equal(saved.locale, "es");
  assert.equal(saved.petSize, 360);
  assert.equal(saved.idleAnimationMode, "events-only");
});

test("task count and translated interpolations respect the selected language", () => {
  assert.equal(translator("en").taskCount(1), "1 task");
  assert.equal(translator("es").taskCount(2), "2 tareas");
  assert.equal(translator("zh-CN").taskCount(2), "2 项任务");
  assert.equal(translator("hi").taskCount(2), "2 कार्य");
  assert.match(translator("es").t("answerWithDetail", { detail: "Review build" }), /Review build$/);
});
