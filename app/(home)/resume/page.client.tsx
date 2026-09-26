"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
// import { createAntiCopy } from "@yukino.js/anti-copy";

const ReactResume = dynamic(
  () => import("@/components/wc/resume.react").then((m) => m.ReactResume),
  { ssr: false },
);

export function ResumeClient() {
  // useEffect(() => {
  //   const antiCopy = createAntiCopy({
  //     mode: "replace",
  //     print: false,
  //     devtools: true,
  //     copy: false,
  //   });
  //   antiCopy.enable();

  //   return () => antiCopy.destroy();
  // }, []);

  return <ReactResume />;
}
