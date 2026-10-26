import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TocList, TopicFooter, TopicSegments } from "@/components/ProgressBits";
import TopicBody from "@/components/TopicBody";
import Icon from "@/components/ui/Icon";
import { flatTopics, getLesson, getModule, getModules } from "@/lib/content";

export function generateStaticParams() {
  return getModules().flatMap((m) => m.lessons.flatMap((l) => l.topics.map((t) => ({ module: m.slug, lesson: l.slug, topic: t.slug }))));
}

type P = { params: Promise<{ module: string; lesson: string; topic: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { module, lesson, topic } = await params;
  return { title: getLesson(module, lesson)?.topics.find((t) => t.slug === topic)?.title ?? "Topic" };
}

export default async function TopicPage({ params }: P) {
  const { module, lesson, topic } = await params;
  const m = getModule(module);
  const l = getLesson(module, lesson);
  const i = l?.topics.findIndex((t) => t.slug === topic) ?? -1;
  if (!m || !l || i < 0) notFound();
  const t = l.topics[i];
  const base = `${m.slug}/${l.slug}`;
  const id = `${base}/${t.slug}`;
  const all = flatTopics();
  const at = all.findIndex((x) => x.module === m.slug && x.lesson === l.slug && x.topic === t.slug);
  const nx = all[at + 1];
  const nextHref = nx ? `/learn/${nx.module}/${nx.lesson}/${nx.topic}` : null;
  const nextLabel = !nx ? "" : nx.lesson === l.slug ? "Next topic" : "Next lesson";
  const topics = l.topics.map((x) => ({ slug: x.slug, title: x.title }));

  return (
    <div>
      <div className="topic-bar">
        <div className="topic-bar-inner">
          <div className="row">
            <Link href={`/learn/${base}`}><Icon name="chevron-left" size={14} /> {l.title}</Link>
            <span className="mono muted">{i + 1} / {l.topics.length}</span>
          </div>
          <TopicSegments base={base} topics={topics} current={i} />
        </div>
      </div>
      <div className="page" style={{ paddingTop: 36 }}>
        <div className="topic-layout">
          <article className="topic-article">
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/curriculum">Curriculum</Link> / <Link href={`/learn/${m.slug}`}>Module {m.order}</Link> / <span>Lesson {m.order}.{l.order}</span>
            </nav>
            <div className="lesson-meta-row">
              <span className="pill"><Icon name="book" size={12} /> Topic {i + 1}</span>
              <span className="pill"><Icon name="clock" size={12} /> {t.minutes} min</span>
            </div>
            <h1>{t.title}</h1>
            <TopicBody id={id} title={t.title} body={t.body} lesson={l.title} />
            <TopicFooter id={id} next={nextHref} nextLabel={nextLabel} />
          </article>
          <aside className="toc" aria-label="In this lesson">
            <h4>In this lesson</h4>
            <TocList base={base} topics={topics} current={i} />
            <Link href={`/learn/${base}#sources`} className="toc-foot">Overview and sources</Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
