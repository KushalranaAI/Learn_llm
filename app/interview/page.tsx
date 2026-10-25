import type { Metadata } from "next";
import { Suspense } from "react";
import InterviewBrowser from "@/components/InterviewBrowser";
import { getInterview, getModules } from "@/lib/content";

export const metadata: Metadata = { title: "Interview prep" };

export default function InterviewPage() {
  const modules = getModules().map((m) => ({ slug: m.slug, title: m.title, order: m.order }));
  return (
    <Suspense>
      <InterviewBrowser sections={getInterview()} modules={modules} />
    </Suspense>
  );
}
