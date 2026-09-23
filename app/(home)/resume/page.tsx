import type { Metadata } from "next";
import { ResumeClient } from "@/app/(home)/resume/page.client";

export const metadata: Metadata = {
  title: "resume",
  description: "hangtiancheng — frontend/full-stack engineer",
};

export default function Resume() {
  return <ResumeClient />;
}
