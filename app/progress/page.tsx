import type { Metadata } from "next";
import ProgressPage from "@/components/ProgressPage";
import { LABS } from "@/labs";
import { getInterview, getOutline } from "@/lib/content";
import { SIMS } from "@/sims";

export const metadata: Metadata = { title: "My progress" };

export default function Page() {
  const questions = getInterview().reduce((a, s) => a + s.questions.length, 0);
  return <ProgressPage outline={getOutline()} totals={{ questions, labs: LABS.length, sims: SIMS.length }} />;
}
