import { render } from "preact";
import { LocationProvider, Router, Route } from "preact-iso";
import { DocsProvider, DocsLayout } from "@swifty.js/docs";
import { AntiCopy } from "@swifty.js/anti-copy/swifty-docs";
import {
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@swifty-docs/generated";
import "./main.css";

render(
  <DocsProvider
    config={docsConfig}
    loadContent={loadContent}
    getSearchIndex={getSearchIndex}
  >
    <LocationProvider>
      <AntiCopy
        mode="replace"
        replaceText={(selection) =>
          `${selection.slice(0, 60)}${selection.length > 60 ? "…" : ""}\n\n— Source: Swifty Homepage (https://hangtiancheng.github.io/h/). Please attribute when sharing.`
        }
        devtools
        onViolation={(e) => console.warn("[anti-copy]", e.type, e.key ?? "")}
      />
      <Router>
        <Route path="/" component={DocsLayout} />
        <Route default component={DocsLayout} />
      </Router>
    </LocationProvider>
  </DocsProvider>,
  document.getElementById("app") ?? document.body,
);
