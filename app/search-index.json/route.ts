// The Ctrl K search index, generated at build time from the course content and the sim/lab registries.
import { LABS } from "@/labs";
import { getGlossary, getInterview, getModules } from "@/lib/content";
import { SIMS } from "@/sims";

export const dynamic = "force-static";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function GET() {
  const items: { kind: string; title: string; context: string; href: string }[] = [];
  for (const m of getModules()) {
    const mod = `Module ${String(m.order).padStart(2, "0")}`;
    items.push({ kind: "Module", title: m.title, context: `${mod} · ${m.summary}`, href: `/learn/${m.slug}` });
    for (const l of m.lessons) {
      items.push({ kind: "Lesson", title: l.title, context: `${mod} · ${m.title}`, href: `/learn/${m.slug}/${l.slug}` });
      for (const t of l.topics) {
        const href = `/learn/${m.slug}/${l.slug}/${t.slug}`;
        items.push({ kind: "Topic", title: t.title, context: l.title, href });
        for (const h of t.body.matchAll(/^##\s+(.+)$/gm)) {
          items.push({ kind: "Section", title: h[1].trim(), context: `${t.title} · ${l.title}`, href: `${href}#${slug(h[1])}` });
        }
      }
    }
  }
  for (const s of SIMS) items.push({ kind: "Simulation", title: s.title, context: s.summary, href: `/simulations/${s.id}` });
  for (const l of LABS) items.push({ kind: "Lab", title: l.title, context: `${l.product} · ${l.summary}`, href: `/labs/${l.slug}` });
  for (const sec of getInterview()) {
    for (const q of sec.questions) items.push({ kind: "Question", title: q.q, context: `Interview prep · ${sec.title} · ${q.level}`, href: `/interview?q=${q.id}` });
  }
  for (const t of getGlossary()) items.push({ kind: "Term", title: t.term, context: t.def, href: `/glossary#${t.slug}` });
  const plain = (t: string) => t.replaceAll("\\$", "$");
  return Response.json(items.map((i) => ({ ...i, title: plain(i.title), context: plain(i.context) })));
}
