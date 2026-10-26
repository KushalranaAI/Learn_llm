import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonBar } from "@/components/ProgressBits";
import Icon from "@/components/ui/Icon";
import { getInterview, getModule, getModules } from "@/lib/content";
import { LABS } from "@/labs";

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
    <div className="page mid">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/curriculum"><Icon name="chevron-left" size={14} /> Curriculum</Link> / <span>Module {m.order}</span>
      </nav>
      <p className="eyebrow">Module {String(m.order).padStart(2, "0")}</p>
      <h1>{m.title}</h1>
      <p className="lead">{m.summary}</p>
      <div className="row" style={{ margin: "18px 0 0", gap: 6 }}>
        <span className="pill">{m.lessons.length} lessons</span>
        <span className="pill">{m.topics} topics</span>
        <span className="pill"><Icon name="clock" size={12} /> {Math.round(m.minutes / 6) / 10} h</span>
        {questions > 0 && <span className="pill">{questions} interview questions</span>}
        {labs.length > 0 && <span className="pill accent">{labs.length} labs</span>}
      </div>
      {first?.topics[0] && (
        <div className="row" style={{ margin: "22px 0 8px" }}>
          <Link href={`/learn/${m.slug}/${first.slug}/${first.topics[0].slug}`} className="btn primary">Start module <Icon name="arrow-right" size={15} /></Link>
          {questions > 0 && <Link href={`/interview?module=${m.slug}`} className="btn">Interview questions</Link>}
        </div>
      )}

      <div className="section-title"><h2>Lessons</h2></div>
      <section className="module open">
        <ol className="lessons" style={{ borderTop: 0, padding: "6px 8px 10px" }}>
          {m.lessons.map((l) => (
            <li key={l.slug}>
              <Link href={`/learn/${m.slug}/${l.slug}`} style={{ gridTemplateColumns: "44px 1fr 18px", alignItems: "center", padding: "14px 10px" }}>
                <span className="lesson-id" style={{ marginRight: 0 }}>{m.order}.{l.order}</span>
                <span className="lesson-main">
                  <span className="lesson-title">{l.title}</span>
                  <span className="lesson-learn">{l.summary}</span>
                  <span style={{ display: "block", marginTop: 10, maxWidth: 360 }}>
                    <LessonBar ids={l.topics.map((t) => `${m.slug}/${l.slug}/${t.slug}`)} minutes={l.minutes} />
                  </span>
                </span>
                <Icon name="chevron-right" size={16} className="muted" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
