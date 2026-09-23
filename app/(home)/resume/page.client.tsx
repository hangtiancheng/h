"use client";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "resume",
  description: "hangtiancheng — frontend/full-stack engineer",
};

import { useEffect } from "react";
import type { DetailedHTMLProps } from "react";
import { createAntiCopy } from "@yukino.js/anti-copy";

// React 19 renders dashed tags as custom elements (props become properties);
// this merges the tag into React's JSX namespace so it typechecks. The
// implementation lives in ./wc as a lit-jsx LitElement.
declare module "react" {
  // Module augmentation of React's JSX namespace requires namespace syntax.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "resume-view": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

/**
 * Thin React shell around the lit-jsx custom element tree in ./wc.
 *
 * The elements are loaded via dynamic import because the `customElement`
 * decorator calls `customElements.define` at module load, which is not
 * available while Next prerenders this page at build time (output:
 * "export"). The <resume-view> tag is prerendered empty and upgrades in
 * the browser; Lit renders into the light DOM so global Tailwind applies.
 */
export function Resume() {
  useEffect(() => {
    void import("@/components/wc/resume-view");

    // Copy protection is scoped to the resume page; it detaches on unmount
    // so the rest of the site (e.g. MDX copy buttons) stays unaffected.
    const antiCopy = createAntiCopy({
      mode: "replace",
      print: false,
      devtools: true,
      copy: false,
    });
    antiCopy.enable();

    return () => antiCopy.destroy();
  }, []);

  return <resume-view />;
}
