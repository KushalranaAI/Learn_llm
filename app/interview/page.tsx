import type { Metadata } from "next";
import { Suspense } from "react";
import InterviewHub from "@/components/interview/InterviewHub";
import { getInterview, getModules, getOutline } from "@/lib/content";

export const metadata: Metadata = { title: "Interview prep" };

export default function InterviewPage() {
  const modules = getModules().map((m) => ({ slug: m.slug, title: m.title, order: m.order }));
  const outline = getOutline().map((m) => ({ slug: m.slug, title: m.title, lessons: m.lessons.map((l) => ({ slug: l.slug, title: l.title, minutes: l.minutes })) }));
  return (
    <Suspense>
      <InterviewHub sections={getInterview()} modules={modules} outline={outline} />
    </Suspense>
  );
}
