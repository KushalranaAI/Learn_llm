import type { Metadata } from "next";
import Link from "next/link";
import Cover from "@/components/Cover";
import { LessonBar } from "@/components/ProgressBits";
import Icon, { type IconName } from "@/components/ui/Icon";
import { getModules } from "@/lib/content";

export const metadata: Metadata = { title: "Curriculum" };
const pad = (n: number) => String(n).padStart(2, "0");

export default function Curriculum() {
  const modules = getModules();
  const topics = modules.reduce((a, m) => a + m.topics, 0);
  const lessons = modules.reduce((a, m) => a + m.lessons.length, 0);
  return (
    <div className="stack">
      <header className="card">
        <span className="eyebrow"><Icon name="grid" size={14} /> Curriculum</span>
        <h1 style={{ marginTop: 8 }}>From one neuron to production LLM systems</h1>
        <p className="lead">
          {modules.length} modules · {lessons} lessons · {topics} topics. Each topic explains the idea, works through the maths with real
          numbers, lets you see it in a simulation, and checks your understanding.
        </p>
      </header>
      {modules.map((m) => (
        <section key={m.slug} className="card">
          <div className="section-title">
            <div>
              <span className="eyebrow"><Icon name={m.icon as IconName} size={14} /> Module {pad(m.order)}</span>
              <h2 style={{ marginTop: 6 }}>{m.title}</h2>
              <p>{m.summary}</p>
            </div>
            <Link href={`/learn/${m.slug}`} className="btn ghost">View module</Link>
          </div>
          <div className="cards-3">
            {m.lessons.map((l) => (
              <Link key={l.slug} href={`/learn/${m.slug}/${l.slug}`} className="module-card">
                <Cover seed={`${m.slug}/${l.slug}`} caption={l.title.toLowerCase()} />
                <span className="muted small">Lesson {pad(l.order)}</span>
                <h3>{l.title}</h3>
                <LessonBar ids={l.topics.map((t) => `${m.slug}/${l.slug}/${t.slug}`)} minutes={l.minutes} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
