/// <reference types="@swifty.js/docs/client" />
/// <reference types="vite/client" />

import { render } from "preact";
import { LocationProvider, Router, Route } from "preact-iso";
import { createContentGuard, DocsProvider, DocsLayout } from "@swifty.js/docs";
import { AntiCopy } from "@swifty.js/anti-copy/swifty-docs";
import {
  docsConfig,
  loadContent,
  getSearchIndex,
  onContentUpdate,
} from "@swifty-docs/generated";
import "./main.css";

// Pages encrypted by docsGuardPlugin (frontmatter `protected: true` +
// DOCS_PASSWORD env) prompt for a password; everything else passes through.
const guard = createContentGuard(loadContent);

render(
  <>
    <guard.ContentGuard />
    <DocsProvider
      config={docsConfig}
      loadContent={guard.loadContent}
      getSearchIndex={getSearchIndex}
      onContentUpdate={onContentUpdate}
    >
      <LocationProvider>
        <AntiCopy
          mode="replace"
          replaceText={(selection) =>
            `${selection}\n\n— Copyright © ${new Date().getFullYear()} hangtiancheng. All rights reserved.
Unauthorized reproduction or distribution of this content is prohibited without prior written permission.`
          }
          devtools
          onViolation={(e) => console.warn("[anti-copy]", e.type, e.key ?? "")}
        />
        <Router>
          <Route path="/" component={DocsLayout} />
          <Route default component={DocsLayout} />
        </Router>
      </LocationProvider>
    </DocsProvider>
  </>,
  document.getElementById("app") ?? document.body,
);
