import { render } from "preact";
import { LocationProvider, Router, Route } from "preact-iso";
import { DocsProvider, DocsLayout } from "@swifty.js/docs";
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
      <Router>
        <Route path="/" component={DocsLayout} />
        <Route default component={DocsLayout} />
      </Router>
    </LocationProvider>
  </DocsProvider>,
  document.getElementById("app") ?? document.body,
);
