import type { Metadata } from "next";
import { Resume } from "@/components/resume";

export const metadata: Metadata = {
  title: "resume",
  description: "hangtiancheng — frontend/full-stack engineer",
};

export default function ResumePage() {
  return <Resume />;
}
