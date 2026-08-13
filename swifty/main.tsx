/// <reference types="@swifty.js/docs/client" />
/// <reference types="vite/client" />

import { createRoot } from "react-dom/client";
import {
  createContentGuard,
  DocsProvider,
  DocsLayout,
  LocationProvider,
} from "@swifty.js/docs";
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

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("app")!).render(
  <>
    <guard.ContentGuard />
    <DocsProvider
      config={docsConfig}
      loadContent={guard.loadContent}
      getSearchIndex={getSearchIndex}
      onContentUpdate={onContentUpdate}
    >
      <LocationProvider>
        {import.meta.env.PROD && (
          <AntiCopy
            mode="replace"
            replaceText={(selection) =>
              `${selection}\n\n— Copyright © ${new Date().getFullYear()} hangtiancheng. All rights reserved.
Unauthorized reproduction or distribution of this content is prohibited without prior written permission.`
            }
            devtools
          />
        )}
        <DocsLayout />
      </LocationProvider>
    </DocsProvider>
  </>,
);
