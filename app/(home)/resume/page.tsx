"use client";

import type { Metadata } from "next";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { createAntiCopy } from "@yukino.js/anti-copy";

export const metadata: Metadata = {
  title: "resume",
  description: "hangtiancheng — frontend/full-stack engineer",
};

const ReactResume = dynamic(
  () => import("@/components/wc/resume.react").then((m) => m.ReactResume),
  { ssr: false },
);

export default function Resume() {
  useEffect(() => {
    const antiCopy = createAntiCopy({
      mode: "replace",
      print: false,
      devtools: true,
      copy: false,
    });
    antiCopy.enable();

    return () => antiCopy.destroy();
  }, []);

  return <ReactResume />;
}
