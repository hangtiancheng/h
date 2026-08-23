// ==UserScript==
// @name         Anti copy
// @namespace    http://github.com/hangtiancheng/h
// @version      0.0.1
// @author       Swifty
// @description  Anti copy
// @match        https://xiaolincoding.com/*
// @match        https://mianshiya.com/*
// @match        https://*.mianshiya.com/*
// @grant        none
// @icon         https://raw.githubusercontent.com/hangtiancheng/h/main/public/favicon.ico
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const style = document.createElement("style");
  style.textContent = `
        *, *::before, *::after {
          user-select: text !important;
          -webkit-user-select: text !important;
          -webkit-touch-callout: default !important;
        }
      `;
  (document.head || document.documentElement).appendChild(style);
  ["copy", "cut", "keydown", "contextmenu", "selectstart"].forEach((evt) => {
    document.addEventListener(evt, (e) => e.stopImmediatePropagation(), true);
  });
  // document.designMode = "on";
})();
