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
})();
