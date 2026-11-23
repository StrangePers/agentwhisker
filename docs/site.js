"use strict";

const locales = ["en", "es", "zh-CN", "hi"];
const localeFrom = value => {
  const base = String(value || "").toLowerCase().split("-")[0];
  return base === "zh" ? "zh-CN" : base;
};
const url = new URL(location.href);
const locale = [url.searchParams.get("lang"), ...navigator.languages]
  .map(localeFrom).find(code => locales.includes(code)) || "en";
const localize = key => siteCopy[key][locales.indexOf(locale)];
document.documentElement.lang = locale;
for (const element of document.querySelectorAll("[data-site]")) element.textContent = localize(element.dataset.site);
for (const element of document.querySelectorAll("[data-site-alt]")) element.alt = localize(element.dataset.siteAlt);
for (const element of document.querySelectorAll("[data-site-label]")) {
  element.setAttribute("aria-label", localize(element.dataset.siteLabel));
}
for (const element of document.querySelectorAll("[data-site-meta]")) {
  element.content = localize(element.dataset.siteMeta);
}
for (const link of document.querySelectorAll("[data-site-link]")) {
  const target = new URL(link.href);
  target.searchParams.set("lang", locale);
  link.href = target.href;
}

const select = document.getElementById("site-language");
if (select) {
  select.value = locale;
  select.addEventListener("change", () => {
    url.searchParams.set("lang", select.value);
    location.assign(url.href);
  });
}
const pagesHost = /^([a-z0-9][a-z0-9-]*)\.github\.io$/i.exec(location.hostname);
const repository = location.pathname.split("/").filter(Boolean)[0];
const release = document.querySelector("[data-release-link]");
if (release && pagesHost && repository && /^[a-z0-9_.-]+$/i.test(repository)) {
  release.href = `https://github.com/${pagesHost[1]}/${repository}/releases/latest`;
}
const motionPreviews = document.querySelectorAll(".motion-grid video");
for (const preview of motionPreviews) {
  preview.addEventListener("play", () => {
    for (const other of motionPreviews) {
      if (other !== preview) other.pause();
    }
  });
}
