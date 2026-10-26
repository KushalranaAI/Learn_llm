import type { Metadata } from "next";
import CurriculumView from "@/components/CurriculumView";
import { getOutline } from "@/lib/content";

export const metadata: Metadata = { title: "Curriculum" };

export default function Curriculum() {
  return <CurriculumView outline={getOutline()} />;
}
