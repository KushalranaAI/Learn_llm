import type { Metadata } from "next";
import Link from "next/link";
import LabStatus from "@/components/LabStatus";
import Icon from "@/components/ui/Icon";
import { LABS } from "@/labs";
import { getModules } from "@/lib/content";

export const metadata: Metadata = { title: "Labs" };

export default function LabsPage() {
  const modules = getModules();
  const groups = modules.map((m) => ({ m, labs: LABS.filter((l) => l.module === m.slug) })).filter((g) => g.labs.length);
  return (
    <div className="page mid stack">
      <header className="page-head">
        <span className="eyebrow"><Icon name="beaker" size={14} /> Labs</span>
        <h1 style={{ marginTop: 8 }}>{LABS.length ? `${LABS.length} hands-on labs` : "Hands-on labs"}</h1>
        <p className="lead">
          Each lab is a small real problem. Predict what happens, compute the key number by hand, then meet measurable goals in a simulation or build the
          system in the sandbox. Every lab has hints and a verified solution.
        </p>
      </header>
      {groups.length === 0 && <div className="card empty">Labs are being written.</div>}
      {groups.map(({ m, labs }) => (
        <section key={m.slug} className="card">
          <div className="section-title">
            <div>
              <span className="eyebrow">Module {String(m.order).padStart(2, "0")}</span>
              <h2 style={{ marginTop: 6 }}>{m.title}</h2>
            </div>
          </div>
          <div className="cards-2">
            {labs.map((lab) => (
              <Link key={lab.slug} href={`/labs/${lab.slug}`} className="link-card">
                <span className="row" style={{ gap: 8 }}>
                  <span className={`pill ${lab.difficulty}`}>{lab.difficulty}</span>
                  <span className="pill"><Icon name="clock" size={12} /> {lab.minutes} min</span>
                  <span className="pill">{lab.steps.length} steps</span>
                  <LabStatus slug={lab.slug} />
                </span>
                <b style={{ marginTop: 8 }}>{lab.title}</b>
                <span className="muted small">{lab.product} · {lab.summary}</span>
                <Icon name="arrow-right" size={16} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
