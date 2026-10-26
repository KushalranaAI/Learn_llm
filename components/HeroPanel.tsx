// The hero picture on the home page: a small LLM serving system with live-looking numbers, in the same
// visual language as the sandbox canvas (and as System Learn's hero).
const NODES = [
  { x: 14, y: 100, w: 70, t: "Users", s: "30 rps", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8c0-3.5 3.1-6 7-6s7 2.5 7 6" },
  { x: 112, y: 100, w: 70, t: "Gateway", s: "auth · limits", icon: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" },
  { x: 210, y: 100, w: 70, t: "Router", s: "easy → small", icon: "M4 6h4a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4h4M16 4l4 2-4 2" },
  { x: 322, y: 40, w: 84, t: "Small model", s: "$0.15 / 1M", icon: "M5 5h14v6H5zM5 14h14v5H5z" },
  { x: 322, y: 160, w: 84, t: "Large model", s: "$15 / 1M", icon: "M5 5h14v6H5zM5 14h14v5H5z" },
];
const WIRES = ["M84 122 H112", "M182 122 H210", "M280 122 C300 122 300 62 322 62", "M280 122 C300 122 300 182 322 182"];

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
        {[[98, 122], [196, 122], [300, 92], [300, 152]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" className="hero-dot" />)}
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
        <span><small>Success</small><b style={{ color: "var(--good)" }}>99.4%</b></span>
        <span><small>p99 first token</small><b>640 ms</b></span>
        <span><small>Cost</small><b>$1,820/mo</b></span>
      </div>
    </div>
  );
}
