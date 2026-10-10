import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "resume",
  description: "hangtiancheng — frontend/full-stack engineer",
};

const RESUME_URL = "https://hangtiancheng.github.io/r/";

export default function Resume() {
  return (
    <iframe
      id="resume"
      src={RESUME_URL}
      title="resume"
      className="h-[calc(100dvh-3.5rem)] w-full border-0"
    />
  );
}
