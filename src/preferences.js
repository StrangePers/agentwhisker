"use strict";
window.AgentWhiskerPreferences = (() => {
  let popup;
  let selectSection;
  let syncControls = () => {};
  function open(section, t, locale, version) {
    if (popup && !popup.closed) {
      selectSection(section);
      popup.focus();
      return;
    }
    const win = window.open("about:blank", "agentwhisker-preferences");
    if (!win) return;
    popup = win;
    const doc = win.document;
    doc.documentElement.lang = locale;
    doc.title = "AgentWhisker · " + t("petSettings");
    for (const name of ["renderer.css","preferences.css"]) {
      const css = doc.createElement("link");
      css.rel = "stylesheet";
      css.href = new URL(name, location.href).href;
      doc.head.append(css);
    }
    doc.body.className = "preferences-window";
    const nav = doc.createElement("nav"), main = doc.createElement("main");
    const brand = doc.createElement("strong"), title = doc.createElement("h1"), content = doc.createElement("div");
    brand.textContent = "AgentWhisker";
    nav.append(brand);
    main.append(title, content);
    doc.body.append(nav, main);
    const store = document.getElementById("preferencesStore");
    const pages = Array.from(store.children);
    const buttons = new Map();
    for (const page of pages) {
      const key = page.dataset.section;
      const button = doc.createElement("button");
      button.textContent = t(key);
      button.onclick = () => selectSection(key);
      nav.append(button);
      buttons.set(key,button);
      content.append(page);
    }
    const about = content.querySelector('[data-section="about"]');
    const release = doc.createElement("p");
    release.textContent = "AgentWhisker v" + version;
    about.prepend(release);
    const original = document.getElementById("quickControls");
    const quick = original.cloneNode(true);
    quick.removeAttribute("id");
    const controls = [];
    for (const copy of quick.querySelectorAll("[id]")) {
      const input = document.getElementById(copy.id);
      controls.push([input,copy]);
      if (!copy.matches("select,input")) continue;
      for (const type of ["input","change"]) copy.addEventListener(type, () => {
        if (copy.type === "checkbox") input.checked = copy.checked;
        else input.value = copy.value;
        input.dispatchEvent(new Event(type,{bubbles:true}));
      });
    }
    content.querySelector('[data-section="appearance"]').prepend(quick);
    syncControls = () => {
      for (const [input,copy] of controls) {
        if (input.type === "checkbox") copy.checked = input.checked;
        else if (input.matches("output,select,input")) copy.value = input.value;
        else if (input.id === "idleAnimationStatus") copy.textContent = input.textContent;
        if ("disabled" in input) copy.disabled = input.disabled;
      }
    };
    selectSection = key => {
      if (!buttons.has(key)) key = "appearance";
      title.textContent = t(key);
      for (const page of pages) page.hidden = page.dataset.section !== key;
      for (const [name,button] of buttons) button.setAttribute("aria-current",String(name === key));
      content.scrollTop = 0;
      syncControls();
    };
    selectSection(section);
    buttons.get(section)?.focus();
    win.addEventListener("keydown", event => { if (event.key === "Escape") win.close(); });
    win.addEventListener("pagehide", () => {
      quick.remove();
      release.remove();
      for (const page of pages) {page.hidden = false;store.append(page);}
      popup = null;
      syncControls = () => {};
    }, {once:true});
  }
  const close = () => { if (popup && !popup.closed) popup.close(); };
  window.addEventListener("pagehide", close);
  return {open, close, sync:() => syncControls()};
})();
