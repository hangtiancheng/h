import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "resume",
  description: "hangtiancheng — frontend/full-stack engineer",
};

const RESUME_URL = "https://hangtiancheng.github.io/r/";

export default function Resume() {
  return (
    // Fill the viewport below the sticky h-14 (3.5rem) navigation header.
    <iframe
      id="resume"
      src={RESUME_URL}
      title="resume"
      className="h-[calc(100dvh-3.5rem)] w-full border-0"
    />
  );
}
