"use client";
// Directive blocks used inside topic markdown (see CONTENT_GUIDE.md): steps, callouts, embedded sims, lab and sandbox cards.
import Link from "next/link";
import { type ReactNode, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getLab } from "@/labs";
import { markSimTried } from "@/lib/progress";
import { getScenario } from "@/sandbox/scenarios";
import { getSim } from "@/sims";
import type { Params } from "@/sims/types";
import { SimPanel } from "@/sims/ui";

type Render = (md: string) => ReactNode;

/** ```steps — first line is the title, then steps separated by lines of `---`. */
export function Steps({ raw, render }: { raw: string; render: Render }) {
  const [title, ...rest] = raw.split("\n");
  const steps = rest.join("\n").split(/^---\s*$/m).map((s) => s.trim()).filter(Boolean);
  const [i, setI] = useState(0);
  return (
    <section className="steps">
      <header>
        <b>{title}</b>
        <span className="mono muted">Step {i + 1} / {steps.length}</span>
      </header>
      <div className="steps-body">{render(steps[i] ?? "")}</div>
      <footer>
        <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => setI(i - 1)}>
          <Icon name="arrow-left" size={14} /> Back
        </button>
        <div className="steps-dots">
          {steps.map((_, j) => (
            <button key={j} type="button" className={j === i ? "on" : j < i ? "past" : ""} onClick={() => setI(j)} aria-label={`Step ${j + 1}`} />
          ))}
        </div>
        <button type="button" className="btn sm" disabled={i === steps.length - 1} onClick={() => setI(i + 1)}>
          Next <Icon name="arrow-right" size={14} />
        </button>
      </footer>
    </section>
  );
}

const CALLOUT_ICON = { note: "info", tip: "lightbulb", warn: "alert", before: "bookmark", math: "sigma", key: "key" } as const;
export type CalloutKind = keyof typeof CALLOUT_ICON;

/** ```callout-<kind> — first line is the title, the rest is markdown. */
export function Callout({ kind, raw, render }: { kind: CalloutKind; raw: string; render: Render }) {
  const [title, ...rest] = raw.split("\n");
  return (
    <aside className={`callout ${kind}`}>
      <b><Icon name={CALLOUT_ICON[kind] ?? "info"} size={15} /> {title}</b>
      <div>{render(rest.join("\n"))}</div>
    </aside>
  );
}

/** ```sim — first line is the sim id, optional second line is JSON params to start from. */
export function SimEmbed({ raw }: { raw: string }) {
  const [id, ...rest] = raw.split("\n");
  const def = getSim(id.trim());
  let initial: Params | undefined;
  try {
    initial = rest.join("\n").trim() ? JSON.parse(rest.join("\n")) : undefined;
  } catch {
    initial = undefined;
  }
  if (!def) return <div className="callout warn"><b>Simulation “{id}” is coming soon.</b></div>;
  return (
    <div onPointerDown={() => markSimTried(def.id)}>
      <SimPanel
        def={def}
        initial={initial}
        compact
        footer={<Link className="link-btn" href={`/simulations/${def.id}`}><Icon name="expand" size={14} /> Open full size</Link>}
      />
    </div>
  );
}

/** ```lab — the lab slug. */
export function LabCard({ raw }: { raw: string }) {
  const lab = getLab(raw.trim());
  return (
    <Link href={lab ? `/labs/${lab.slug}` : "/labs"} className="link-card practice">
      <span className="badge"><Icon name="beaker" size={14} /> Lab</span>
      <b>{lab?.title ?? "Hands-on lab"}</b>
      <span className="muted">{lab ? `${lab.summary} · ${lab.minutes} min · ${lab.difficulty}` : "Opens in the labs section."}</span>
      <Icon name="arrow-right" size={16} />
    </Link>
  );
}

/** ```sandbox — the scenario id. */
export function SandboxCard({ raw }: { raw: string }) {
  const sc = getScenario(raw.trim());
  return (
    <Link href={sc ? `/sandbox?s=${sc.id}` : "/sandbox"} className="link-card practice">
      <span className="badge"><Icon name="boxes" size={14} /> Sandbox</span>
      <b>{sc?.title ?? "Try it in the sandbox"}</b>
      <span className="muted">{sc?.summary ?? "Build the system yourself and push traffic through it."}</span>
      <Icon name="arrow-right" size={16} />
    </Link>
  );
}
