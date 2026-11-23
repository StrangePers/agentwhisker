"use strict";

const pagesHost = /^([a-z0-9][a-z0-9-]*)\.github\.io$/i.exec(location.hostname);
const repository = location.pathname.split("/").filter(Boolean)[0];
if (pagesHost && repository && /^[a-z0-9_.-]+$/i.test(repository)) {
  const link = document.querySelector("[data-release-link]");
  link.href = `https://github.com/${pagesHost[1]}/${repository}/releases/latest`;
  link.textContent = "Download for Windows";
}

const motionPreviews = document.querySelectorAll(".motion-grid video");
for (const preview of motionPreviews) {
  preview.addEventListener("play", () => {
    for (const other of motionPreviews) {
      if (other !== preview) other.pause();
    }
  });
}
