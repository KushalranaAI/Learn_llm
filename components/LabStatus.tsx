"use client";
import { useProgress } from "@/lib/progress";
import Icon from "./ui/Icon";

export default function LabStatus({ slug }: { slug: string }) {
  const p = useProgress().labs[slug];
  if (p?.passed) return <span className="pill green"><Icon name="trophy" size={12} /> done</span>;
  if (p?.step) return <span className="pill accent">step {p.step}</span>;
  return null;
}
