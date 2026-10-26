import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MiniMarkdown from "@/components/MiniMarkdown";
import { DoneTick, LessonBar } from "@/components/ProgressBits";
import Icon from "@/components/ui/Icon";
import { getLab } from "@/labs";
import { getInterview, getLesson, getModule, getModules } from "@/lib/content";
import { getScenario } from "@/sandbox/scenarios";
import { getSim } from "@/sims";

const pad = (n: number) => String(n).padStart(2, "0");

export function generateStaticParams() {
  return getModules().flatMap((m) => m.lessons.map((l) => ({ module: m.slug, lesson: l.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ module: string; lesson: string }> }): Promise<Metadata> {
  const { module, lesson } = await params;
  return { title: getLesson(module, lesson)?.title ?? "Lesson" };
}

export default async function LessonPage({ params }: { params: Promise<{ module: string; lesson: string }> }) {
  const { module, lesson } = await params;
  const m = getModule(module);
  const l = getLesson(module, lesson);
  if (!m || !l) notFound();
  const base = `${m.slug}/${l.slug}`;
  const sims = l.sims.map(getSim).filter((s) => s !== undefined);
  const labs = l.labs.map(getLab).filter((s) => s !== undefined);
  const scenarios = l.sandbox.map(getScenario).filter((s) => s !== undefined);
  const questions = getInterview().find((s) => s.module === m.slug && (s.lesson ?? s.slug) === l.slug)?.questions.length ?? 0;
  const i = m.lessons.findIndex((x) => x.slug === l.slug);
  const next = m.lessons[i + 1];

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/curriculum"><Icon name="chevron-left" size={14} /> Curriculum</Link> / <Link href={`/learn/${m.slug}`}>Module {m.order} · {m.title}</Link>
      </nav>
      <div className="grid-main">
      <div className="stack" style={{ gap: 20 }}>
        <header>
          <div className="lesson-meta-row">
            <span className="pill"><Icon name="book" size={12} /> Lesson {m.order}.{l.order}</span>
            <span className="pill"><Icon name="clock" size={12} /> {l.minutes} min</span>
            <span className="pill">{l.topics.length} topics</span>
          </div>
          <h1>{l.title}</h1>
          <p className="lead">{l.summary}</p>
          <div style={{ maxWidth: 420, margin: "22px 0" }}>
            <LessonBar ids={l.topics.map((t) => `${base}/${t.slug}`)} minutes={l.minutes} />
          </div>
          {l.topics[0] && (
            <div className="row">
              <Link href={`/learn/${base}/${l.topics[0].slug}`} className="btn primary">Start lesson <Icon name="arrow-right" size={15} /></Link>
              {questions > 0 && <Link href={`/interview?section=${l.slug}`} className="btn">{questions} interview questions</Link>}
            </div>
          )}
        </header>

        <section className="card">
          <h2 style={{ marginBottom: 8, fontSize: "1.05rem" }}>Topics</h2>
          <div className="list-rows">
            {l.topics.map((t, k) => (
              <Link key={t.slug} href={`/learn/${base}/${t.slug}`}>
                <span className="lesson-id" style={{ width: 26, marginRight: 0 }}>{k + 1}</span>
                <span style={{ flex: 1 }}>{t.title}</span>
                <span className="muted small">{t.minutes} min{t.checks ? ` · ${t.checks} check${t.checks > 1 ? "s" : ""}` : ""}</span>
                <DoneTick id={`${base}/${t.slug}`} />
              </Link>
            ))}
          </div>
        </section>

        {(sims.length > 0 || labs.length > 0 || scenarios.length > 0) && (
          <section className="card">
            <h2 style={{ marginBottom: 14, fontSize: "1.05rem" }}>Practise it</h2>
            <div className="cards-2">
              {sims.map((s) => (
                <Link key={s.id} href={`/simulations/${s.id}`} className="link-card">
                  <span className="badge"><Icon name="activity" size={14} /> Simulation</span>
                  <b>{s.title}</b>
                  <span className="muted small">{s.summary}</span>
                  <Icon name="arrow-right" size={16} />
                </Link>
              ))}
              {labs.map((lab) => (
                <Link key={lab.slug} href={`/labs/${lab.slug}`} className="link-card">
                  <span className="badge"><Icon name="beaker" size={14} /> Lab · {lab.minutes} min</span>
                  <b>{lab.title}</b>
                  <span className="muted small">{lab.summary}</span>
                  <Icon name="arrow-right" size={16} />
                </Link>
              ))}
              {scenarios.map((s) => (
                <Link key={s.id} href={`/sandbox?s=${s.id}`} className="link-card">
                  <span className="badge"><Icon name="boxes" size={14} /> Sandbox</span>
                  <b>{s.title}</b>
                  <span className="muted small">{s.summary}</span>
                  <Icon name="arrow-right" size={16} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="side">
        {l.objectives.length > 0 && (
          <section className="card">
            <h3 style={{ marginBottom: 14 }}>After this lesson you can</h3>
            <ul className="prose prose-sm" style={{ paddingLeft: 18, margin: 0 }}>
              {l.objectives.map((o) => <li key={o}>{o}</li>)}
            </ul>
          </section>
        )}
        {l.prerequisites && (
          <section className="card">
            <h3 style={{ marginBottom: 10 }}>Before you start</h3>
            <MiniMarkdown>{l.prerequisites}</MiniMarkdown>
          </section>
        )}
        {l.sources.length > 0 && (
          <section className="card" id="sources">
            <h3 style={{ marginBottom: 10 }}>Sources and further reading</h3>
            <ul className="prose prose-sm" style={{ paddingLeft: 18, margin: 0 }}>
              {l.sources.map((s) => (
                <li key={s.title}>
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : <i>{s.title}</i>}
                  {s.authors ? `, ${s.authors}` : ""}
                  {s.year ? ` (${s.year})` : ""}
                  {s.note ? <span className="muted">. {s.note}</span> : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
        {next && (
          <Link href={`/learn/${m.slug}/${next.slug}`} className="link-card">
            <span className="muted small">Next lesson</span>
            <b>{next.title}</b>
            <Icon name="arrow-right" size={16} />
          </Link>
        )}
      </aside>
      </div>
    </div>
  );
}
