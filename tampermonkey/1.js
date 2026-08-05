// ==UserScript==
// @name         Copy
// @namespace    http://github.com/hangtiancheng
// @version      1.0.0
// @description  Copy
// @author       Swifty
// @match        https://xiaolincoding.com/*
// @icon         https://raw.githubusercontent.com/hangtiancheng/h/main/public/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Your code here...
  ["copy", "cut", "keydown", "contextmenu", "selectstart"].forEach((evt) => {
    document.addEventListener(evt, (e) => e.stopImmediatePropagation(), true);
  });
  document.designMode = "on";
})();
