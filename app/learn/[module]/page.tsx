import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Cover from "@/components/Cover";
import { LessonBar } from "@/components/ProgressBits";
import Icon, { type IconName } from "@/components/ui/Icon";
import { getInterview, getModule, getModules } from "@/lib/content";
import { LABS } from "@/labs";

const pad = (n: number) => String(n).padStart(2, "0");

export function generateStaticParams() {
  return getModules().map((m) => ({ module: m.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module } = await params;
  return { title: getModule(module)?.title ?? "Module" };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const m = getModule(module);
  if (!m) notFound();
  const questions = getInterview().filter((s) => s.module === m.slug).reduce((a, s) => a + s.questions.length, 0);
  const labs = LABS.filter((l) => l.module === m.slug);
  const first = m.lessons[0];
  return (
    <div className="stack">
      <header className="card" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,360px)", gap: 32, alignItems: "center" }}>
        <div>
          <Link href="/curriculum" className="eyebrow"><Icon name={m.icon as IconName} size={14} /> Module {pad(m.order)}</Link>
          <h1 style={{ marginTop: 8 }}>{m.title}</h1>
          <p className="lead">{m.summary}</p>
          <div className="row" style={{ marginTop: 18 }}>
            <span className="pill">{m.lessons.length} lessons</span>
            <span className="pill">{m.topics} topics</span>
            <span className="pill"><Icon name="clock" size={13} /> {Math.round(m.minutes / 6) / 10} h</span>
            {questions > 0 && <span className="pill">{questions} interview questions</span>}
            {labs.length > 0 && <span className="pill accent">{labs.length} labs</span>}
          </div>
          {first?.topics[0] && (
            <div className="row" style={{ marginTop: 24 }}>
              <Link href={`/learn/${m.slug}/${first.slug}/${first.topics[0].slug}`} className="btn">Start module</Link>
              {questions > 0 && <Link href={`/interview?module=${m.slug}`} className="btn ghost">Interview questions</Link>}
            </div>
          )}
        </div>
        <Cover seed={m.slug} caption={`module ${pad(m.order)} · ${m.title.toLowerCase()}`} />
      </header>
      <section className="card">
        <div className="list-rows">
          {m.lessons.map((l) => (
            <Link key={l.slug} href={`/learn/${m.slug}/${l.slug}`} style={{ alignItems: "flex-start", padding: "20px 4px" }}>
              <span className="mono muted" style={{ width: 34 }}>{pad(l.order)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: "1.1rem", marginBottom: 4, color: "var(--text)" }}>{l.title}</b>
                <span className="muted">{l.summary}</span>
                <span style={{ display: "block", marginTop: 12, maxWidth: 360 }}>
                  <LessonBar ids={l.topics.map((t) => `${m.slug}/${l.slug}/${t.slug}`)} minutes={l.minutes} />
                </span>
              </span>
              <Icon name="chevron-right" size={18} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
