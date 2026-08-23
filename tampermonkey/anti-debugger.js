// ==UserScript==
// @name         Anti debugger
// @namespace    http://github.com/hangtiancheng/h
// @version      0.0.1
// @description  Anti debugger
// @author       Swifty
// @match        https://www.mianshiya.com/*
// @grant        none
// @run-at       document-start
// @icon         https://raw.githubusercontent.com/hangtiancheng/h/main/public/favicon.ico
// ==/UserScript==

const _constructor = Function.prototype.constructor;
Function.prototype.constructor = function (...args) {
  if (args.some((a) => typeof a === "string" && a.includes("debugger"))) {
    return function () {
      /** noop */
    };
  }
  return _constructor.apply(this, args);
};
