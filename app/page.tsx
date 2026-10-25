import Dashboard from "@/components/Dashboard";
import { LABS } from "@/labs";
import { getInterview, getModules, getOutline } from "@/lib/content";
import { SCENARIOS } from "@/sandbox/scenarios";
import { SIMS } from "@/sims";

export default function Home() {
  const sections = getInterview();
  const qs = sections.flatMap((s) => s.questions);
  const modules = getModules();
  const interview = {
    total: qs.length,
    junior: qs.filter((q) => q.level === "junior").length,
    mid: qs.filter((q) => q.level === "mid").length,
    senior: qs.filter((q) => q.level === "senior").length,
    byModule: modules
      .map((m) => ({ slug: m.slug, title: m.title, count: sections.filter((s) => s.module === m.slug).reduce((a, s) => a + s.questions.length, 0) }))
      .filter((m) => m.count > 0),
  };
  return <Dashboard outline={getOutline()} interview={interview} practice={{ sims: SIMS.length, labs: LABS.length, scenarios: SCENARIOS.length }} />;
}
