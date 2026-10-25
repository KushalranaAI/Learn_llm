import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { getModules } from "@/lib/content";
import { SIMS } from "@/sims";

export const metadata: Metadata = { title: "Simulations" };

export default function SimulationsPage() {
  const modules = getModules();
  const groups = modules.map((m) => ({ m, sims: SIMS.filter((s) => s.module === m.slug) })).filter((g) => g.sims.length);
  const known = new Set(modules.map((m) => m.slug));
  const other = SIMS.filter((s) => !known.has(s.module));
  return (
    <div className="stack">
      <header className="card">
        <span className="eyebrow"><Icon name="activity" size={14} /> Simulations</span>
        <h1 style={{ marginTop: 8 }}>{SIMS.length} live models of how LLM systems behave</h1>
        <p className="lead">
          Move a slider and every number and chart updates. Each one shows the maths it computes under “How this is computed”, so you can check it by hand.
        </p>
      </header>
      {groups.map(({ m, sims }) => (
        <section key={m.slug} className="card">
          <div className="section-title">
            <div>
              <span className="eyebrow">Module {String(m.order).padStart(2, "0")}</span>
              <h2 style={{ marginTop: 6 }}>{m.title}</h2>
            </div>
          </div>
          <div className="cards-2">
            {sims.map((s) => (
              <Link key={s.id} href={`/simulations/${s.id}`} className="link-card">
                <b>{s.title}</b>
                <span className="muted small">{s.summary}</span>
                <span className="row" style={{ gap: 6, marginTop: 6 }}>{s.tags.slice(0, 4).map((t) => <span key={t} className="pill">{t}</span>)}</span>
                <Icon name="arrow-right" size={16} />
              </Link>
            ))}
          </div>
        </section>
      ))}
      {other.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom: 18 }}>More</h2>
          <div className="cards-2">
            {other.map((s) => (
              <Link key={s.id} href={`/simulations/${s.id}`} className="link-card">
                <b>{s.title}</b>
                <span className="muted small">{s.summary}</span>
                <Icon name="arrow-right" size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
