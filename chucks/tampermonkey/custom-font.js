// ==UserScript==
// @name         Custom font
// @namespace    http://github.com/hangtiancheng/h
// @version      0.0.1
// @description  Custom font
// @author       Yukino
// @match        *://*/*
// @icon         https://raw.githubusercontent.com/hangtiancheng/h/main/public/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  const __font_sans = `Yukino, "Maple Mono", Menlo, "Cascadia Code", "Sarasa Gothic SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
  const __font_mono = `Yukino, "Maple Mono", Menlo, "Cascadia Code", "Sarasa Gothic SC", "PingFang SC", "Microsoft YaHei", monospace`;
  const css = `
    html, body, body * {
      font-family: ${__font_sans} !important;
    }
    ${
      __font_mono
        ? `
    code, pre, kbd, samp, tt, textarea, input[type="text"] {
      font-family: ${__font_mono} !important;
    }`
        : ""
    }
  `;

  const style = document.createElement("style");
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();
