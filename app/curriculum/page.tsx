import type { Metadata } from "next";
import CurriculumView from "@/components/CurriculumView";
import { getMap, getOutline } from "@/lib/content";

export const metadata: Metadata = { title: "Roadmap" };

export default function Curriculum() {
  return <CurriculumView outline={getOutline()} goals={getMap().goals} />;
}
