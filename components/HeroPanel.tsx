// The hero picture on the home page: the path from text to the next token inside an LLM, in the same
// visual language as System Learn's hero.
const NODES = [
  { x: 14, y: 100, w: 70, t: "Text", s: "\"The cat\"", icon: "M5 6h14M5 12h14M5 18h9" },
  { x: 112, y: 100, w: 70, t: "Tokens", s: "BPE ids", icon: "M4 7h6v10H4zM14 7h6v10h-6z" },
  { x: 210, y: 100, w: 70, t: "Embed", s: "d = 768", icon: "M4 18 10 6l4 8 2-4 4 8" },
  { x: 322, y: 40, w: 84, t: "Transformer", s: "× 12 blocks", icon: "M5 5h14v6H5zM5 14h14v5H5z" },
  { x: 322, y: 160, w: 84, t: "Next token", s: "\"sat\" 41%", icon: "M5 12h12M13 7l5 5-5 5" },
];
const WIRES = ["M84 122 H112", "M182 122 H210", "M280 122 C300 122 300 62 322 62", "M364 84 V160"];

export default function HeroPanel() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <svg viewBox="0 0 430 236" role="img">
        <defs>
          <pattern id="hero-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="var(--grid)" />
          </pattern>
        </defs>
        <rect width="430" height="236" fill="url(#hero-grid)" />
        {WIRES.map((d) => <path key={d} d={d} className="hero-wire" />)}
        {[[98, 122], [196, 122], [300, 92], [364, 122]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" className="hero-dot" />)}
        {NODES.map((n) => (
          <g key={n.t} className="hero-node" transform={`translate(${n.x} ${n.y})`}>
            <rect width={n.w} height="44" rx="10" />
            <g transform="translate(8 8) scale(0.58)" fill="none" stroke="var(--accent-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={n.icon} />
            </g>
            <text x="26" y="19">{n.t}</text>
            <text x="8" y="36" className="sub">{n.s}</text>
          </g>
        ))}
      </svg>
      <div className="hero-metrics">
        <span><small>Parameters</small><b>124M</b></span>
        <span><small>Val loss</small><b style={{ color: "var(--good)" }}>3.28</b></span>
        <span><small>Perplexity</small><b>26.6</b></span>
      </div>
    </div>
  );
}
