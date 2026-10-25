import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { getGlossary, getModules } from "@/lib/content";

export const metadata: Metadata = { title: "Glossary" };

export default function GlossaryPage() {
  const terms = getGlossary();
  const modules = getModules();
  const letters = [...new Set(terms.map((t) => t.term[0].toUpperCase()))].sort();
  const lessonTitle = (ref?: string) => {
    if (!ref) return null;
    const [m, l] = ref.split("/");
    return modules.find((x) => x.slug === m)?.lessons.find((x) => x.slug === l)?.title ?? null;
  };
  return (
    <div className="stack">
      <header className="card">
        <span className="eyebrow"><Icon name="book" size={14} /> Glossary</span>
        <h1 style={{ marginTop: 8 }}>{terms.length} terms, in plain language</h1>
        <p className="lead">Every term the course uses, with a link to the lesson that explains it properly.</p>
        <nav className="alpha" style={{ marginTop: 20 }} aria-label="Jump to letter">
          {letters.map((l) => <a key={l} href={`#letter-${l}`}>{l}</a>)}
        </nav>
      </header>
      <section className="card">
        {letters.map((letter) => (
          <div key={letter} id={`letter-${letter}`} style={{ scrollMarginTop: 24 }}>
            <h2 className="accent-text" style={{ margin: "18px 0 6px" }}>{letter}</h2>
            {terms.filter((t) => t.term[0].toUpperCase() === letter).map((t) => {
              const title = lessonTitle(t.lesson);
              return (
                <div key={t.slug} id={t.slug} className="term">
                  <h3>{t.term}</h3>
                  <p>{t.def}</p>
                  {title && <Link href={`/learn/${t.lesson}`} className="link-btn">Learn it in: {title} <Icon name="arrow-right" size={13} /></Link>}
                </div>
              );
            })}
          </div>
        ))}
        {terms.length === 0 && <div className="empty">The glossary is being written.</div>}
      </section>
    </div>
  );
}
