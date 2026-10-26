import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SimFull from "@/components/SimFull";
import Icon from "@/components/ui/Icon";
import { getModules } from "@/lib/content";
import { LABS } from "@/labs";
import { getSim, SIMS } from "@/sims";

export function generateStaticParams() {
  return SIMS.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getSim(id)?.title ?? "Simulation" };
}

export default async function SimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def = getSim(id);
  if (!def) notFound();
  const lessons = getModules().flatMap((m) => m.lessons.filter((l) => l.sims.includes(id)).map((l) => ({ m, l })));
  const labs = LABS.filter((lab) => lab.steps.some((s) => s.type === "sim" && s.sim === id));
  return (
    <div className="page wide stack" style={{ gap: 20 }}>
      <header className="page-head">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/simulations"><Icon name="chevron-left" size={14} /> Simulations</Link>
          {lessons[0] && <> / <Link href={`/learn/${lessons[0].m.slug}`}>{lessons[0].m.title}</Link></>}
        </nav>
        <h1>{def.title}</h1>
        <p className="lead">{def.summary}</p>
        <div className="row" style={{ gap: 6, marginTop: 14 }}>
          {lessons.slice(0, 3).map(({ m, l }) => <Link key={l.slug} href={`/learn/${m.slug}/${l.slug}`} className="pill">Lesson {m.order}.{l.order}</Link>)}
          {def.tags.slice(0, 4).map((t) => <span key={t} className="pill">{t}</span>)}
        </div>
      </header>
      <SimFull id={id} />
      {(lessons.length > 0 || labs.length > 0) && (
        <section className="card">
          <h2 style={{ marginBottom: 16 }}>Where it is used</h2>
          <div className="cards-2">
            {lessons.map(({ m, l }) => (
              <Link key={`${m.slug}/${l.slug}`} href={`/learn/${m.slug}/${l.slug}`} className="link-card">
                <span className="badge"><Icon name="book" size={14} /> Lesson</span>
                <b>{l.title}</b>
                <span className="muted small">{m.title}</span>
                <Icon name="arrow-right" size={16} />
              </Link>
            ))}
            {labs.map((lab) => (
              <Link key={lab.slug} href={`/labs/${lab.slug}`} className="link-card">
                <span className="badge"><Icon name="beaker" size={14} /> Lab</span>
                <b>{lab.title}</b>
                <span className="muted small">{lab.summary}</span>
                <Icon name="arrow-right" size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
