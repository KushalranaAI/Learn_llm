"use client";
// Diagrams from ```mermaid blocks / frontmatter. Styled with the app's palette and always kept at a readable size:
// a left-to-right flowchart that would be too wide is shown top-down instead (both are rendered, the fitting one is
// shown), anything still wider scrolls sideways. Expandable, and explainable by the AI tutor.
import { useEffect, useId, useRef, useState } from "react";
import { useResolvedTheme } from "@/lib/theme";
import Icon from "./ui/Icon";

let renders = 0;
const MIN_SCALE = 0.8; // below this the text gets too small to read comfortably
const PAD = 34; // horizontal padding + border of the frame

const THEMES = {
  light: {
    background: "#ffffff", mainBkg: "#e7f7f0", primaryColor: "#e7f7f0", primaryTextColor: "#11151c", primaryBorderColor: "#059669",
    secondaryColor: "#e4f1fb", tertiaryColor: "#f1f3f7", lineColor: "#636c7e", textColor: "#11151c", nodeBorder: "#059669",
    edgeLabelBackground: "#ffffff", clusterBkg: "#f4f6f9", clusterBorder: "#cfd6e1", titleColor: "#11151c",
  },
  dark: {
    background: "#0f1218", mainBkg: "#10261f", primaryColor: "#10261f", primaryTextColor: "#e8ebf2", primaryBorderColor: "#34d399",
    secondaryColor: "#12263a", tertiaryColor: "#141821", lineColor: "#828aa0", textColor: "#e8ebf2", nodeBorder: "#34d399",
    edgeLabelBackground: "#0f1218", clusterBkg: "#141821", clusterBorder: "#2e3546", titleColor: "#e8ebf2",
  },
} as const;

type Drawing = { svg: string; width: number };
const LR = /^(\s*(?:flowchart|graph))\s+(LR|RL)\b/;

export default function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const theme = useResolvedTheme();
  const wrap = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState<Drawing | null>(null); // as written
  const [tall, setTall] = useState<Drawing | null>(null); // top-down alternative for left-to-right flows
  const [avail, setAvail] = useState(0);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        look: "classic",
        themeVariables: { ...THEMES[theme], fontSize: "15px" },
        flowchart: { curve: "basis", padding: 10, nodeSpacing: 28, rankSpacing: 36, wrappingWidth: 140, htmlLabels: true },
      });
      const draw = async (text: string): Promise<Drawing> => {
        const out = await mermaid.render(`m${id}-${++renders}`, text);
        const vb = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) [\d.]+"/.exec(out.svg);
        return { svg: out.svg, width: vb ? Number(vb[1]) : 0 };
      };
      try {
        const first = await draw(chart);
        const alt = LR.test(chart) ? await draw(chart.replace(LR, "$1 TD")).catch(() => null) : null;
        if (cancelled) return;
        setWide(first);
        setTall(alt);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chart, id, theme]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setAvail(Math.max(0, el.clientWidth - PAD));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (error) return <pre>{chart}</pre>;

  // show the layout that fits at a readable size; otherwise the narrower one, scrolling if it must
  const fits = (d: Drawing) => avail === 0 || d.width * MIN_SCALE <= avail;
  const shown = wide && tall && !fits(wide) && tall.width < wide.width ? tall : wide;
  const width = shown ? Math.round(shown.width * Math.min(1, Math.max(MIN_SCALE, avail ? avail / shown.width : 1))) : 0;

  return (
    <div ref={wrap} className="diagram-wrap">
      {!shown ? (
        <div className="skeleton" style={{ height: 140, margin: "1em 0" }} aria-busy="true" />
      ) : (
        <figure className="diagram-fig">
          <div className="diagram" role="img" aria-label="Diagram">
            <div className="diagram-svg" style={{ width }} dangerouslySetInnerHTML={{ __html: shown.svg }} />
          </div>
          <figcaption className="diagram-tools">
            <button type="button" className="chip-btn" onClick={() => setExpanded(true)}>
              <Icon name="expand" size={14} /> Expand
            </button>
          </figcaption>
          {expanded && (
            <div className="palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && setExpanded(false)}>
              <div className="diagram-modal" role="dialog" aria-modal="true" aria-label="Diagram, full size">
                <button type="button" className="icon-btn diagram-close" onClick={() => setExpanded(false)} aria-label="Close">
                  <Icon name="x" />
                </button>
                <div className="diagram-svg full" style={{ width: Math.max(wide?.width ?? 0, 600) }} dangerouslySetInnerHTML={{ __html: (wide ?? shown).svg }} />
              </div>
            </div>
          )}
        </figure>
      )}
    </div>
  );
}
