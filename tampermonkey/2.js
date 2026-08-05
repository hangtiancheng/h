// ==UserScript==
// @name         Custom font
// @namespace    http://github.com/hangtiancheng
// @version      1.0.0
// @description  Custom font
// @author       Swifty
// @match        *://*/*
// @icon         https://raw.githubusercontent.com/hangtiancheng/h/main/public/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  const __font_sans = `"Geist Mono", Menlo, "Cascadia Code", "Swifty", "PingFang SC", "Microsoft YaHei", sans-serif`;
  const __font_mono = `"Geist Mono", Menlo, "Cascadia Code", "Swifty", monospace`;
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
