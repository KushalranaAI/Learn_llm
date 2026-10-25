// Generated cover art for modules and lessons: a small, deterministic "plot" (heatmap, bars, scatter or curves)
// seeded by the slug, with a monospace caption, so every card has its own picture without image files.
const PALETTE = ["#ec9a52", "#7cc49b", "#7fb2ec", "#b79cf0", "#e6cb6a", "#ec7f70"];

function rng(seedText: string) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Style = "heatmap" | "bars" | "scatter" | "curves";
const STYLES: Style[] = ["heatmap", "bars", "scatter", "curves"];

export default function Cover({ seed, caption, style }: { seed: string; caption?: string; style?: Style }) {
  const r = rng(seed);
  const kind = style ?? STYLES[Math.floor(r() * STYLES.length)];
  const W = 320, H = 200, top = 30;
  const c1 = PALETTE[Math.floor(r() * PALETTE.length)];
  const c2 = PALETTE[(PALETTE.indexOf(c1) + 1 + Math.floor(r() * 4)) % PALETTE.length];
  let body: React.ReactNode = null;

  if (kind === "heatmap") {
    const cols = 16, rows = 8, cw = (W - 40) / cols, ch = (H - top - 20) / rows;
    const cx = r() * cols, cy = r() * rows;
    body = Array.from({ length: rows * cols }, (_, k) => {
      const i = Math.floor(k / cols), j = k % cols;
      const d = Math.hypot((j - cx) / cols, (i - cy) / rows);
      const v = Math.max(0, Math.min(1, 1 - d * 1.6 + (r() - 0.5) * 0.35));
      return <rect key={k} x={20 + j * cw + 1} y={top + i * ch + 1} width={cw - 2} height={ch - 2} rx={2} fill={v > 0.5 ? c1 : c2} fillOpacity={0.12 + v * 0.75} />;
    });
  } else if (kind === "bars") {
    const n = 14, bw = (W - 40) / n;
    let v = 0.3 + r() * 0.3;
    body = Array.from({ length: n }, (_, i) => {
      v = Math.max(0.08, Math.min(1, v + (r() - 0.45) * 0.3));
      const h = v * (H - top - 24);
      return <rect key={i} x={20 + i * bw + bw * 0.18} y={H - 18 - h} width={bw * 0.64} height={h} rx={3} fill={i % 3 === 2 ? c2 : c1} fillOpacity={0.85} />;
    });
  } else if (kind === "scatter") {
    const clusters = 3;
    const centres = Array.from({ length: clusters }, () => [40 + r() * (W - 80), top + 20 + r() * (H - top - 50)]);
    body = Array.from({ length: 46 }, (_, i) => {
      const [x0, y0] = centres[i % clusters];
      return <circle key={i} cx={x0 + (r() - 0.5) * 70} cy={y0 + (r() - 0.5) * 50} r={3 + r() * 3} fill={PALETTE[(i % clusters) * 2 % PALETTE.length]} fillOpacity={0.85} />;
    });
  } else {
    const lines = 3;
    body = Array.from({ length: lines }, (_, k) => {
      const a = 0.5 + r() * 2, b = r() * 3, amp = 0.15 + r() * 0.25, base = 0.25 + k * 0.22;
      const d = Array.from({ length: 41 }, (_, i) => {
        const x = i / 40;
        const y = base + amp * Math.sin(a * x * 6 + b) * (1 - x * 0.5) + (k === 0 ? -0.15 * x : 0);
        return `${i ? "L" : "M"}${(20 + x * (W - 40)).toFixed(1)},${(H - 18 - y * (H - top - 30)).toFixed(1)}`;
      }).join("");
      return <path key={k} d={d} fill="none" stroke={PALETTE[(PALETTE.indexOf(c1) + k * 2) % PALETTE.length]} strokeWidth={2.5} strokeLinecap="round" />;
    });
  }

  return (
    <div className="cover" aria-hidden="true">
      {caption && <span className="cover-caption">{caption}</span>}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <line x1={20} x2={W - 20} y1={H - 18} y2={H - 18} stroke="currentColor" strokeOpacity={0.15} />
        {body}
      </svg>
    </div>
  );
}
