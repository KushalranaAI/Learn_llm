"use client";
// Animation kit for group C sims: reduced-motion detection, a play/pause/step/reset driver, tweens, a typewriter,
// the transport bar, and one shared stylesheet (keyframes are disabled under prefers-reduced-motion).
import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------- reduced motion ---------------- */

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/* ---------------- playback driver ---------------- */

export type Playback = {
  playing: boolean;
  reduced: boolean;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  step: () => void;
  reset: () => void;
  /** attach to the sim's root to auto-start the first time it scrolls into view (when autoplay is on) */
  rootRef: (el: HTMLElement | null) => void;
};

/**
 * Drives an index from 0 to `last`. The index can live anywhere (local state or a sim param): pass it with its setter.
 * Under prefers-reduced-motion, Play jumps to the final state and Step advances one frame with no tweening.
 */
export function usePlayback(opts: {
  index: number;
  setIndex: (i: number) => void;
  last: number;
  ms: number | ((i: number) => number);
  autoplay?: boolean;
}): Playback {
  const { index, last, autoplay } = opts;
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const o = ref.current;
    const wait = typeof o.ms === "function" ? o.ms(index) : o.ms;
    const id = setTimeout(() => ref.current.setIndex(Math.min(ref.current.last, index + 1)), wait);
    return () => clearTimeout(id);
  }, [playing, index, last]);

  // Play always walks the sequence (from the start when it has finished). Reduced motion turns off the sliding and
  // fading in CSS, not the steps themselves: the learner still sees each state in turn.
  const play = useCallback(() => {
    const o = ref.current;
    if (o.index >= o.last) o.setIndex(0);
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const step = useCallback(() => {
    setPlaying(false);
    const o = ref.current;
    o.setIndex(o.index >= o.last ? 0 : o.index + 1);
  }, []);
  const reset = useCallback(() => {
    setPlaying(false);
    ref.current.setIndex(0);
  }, []);

  // auto-start once when first visible
  const started = useRef(false);
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!autoplay || !el || started.current || reduced || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !started.current) {
          started.current = true;
          ref.current.setIndex(0);
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoplay, el, reduced]);

  return { playing, reduced, toggle, play, pause, step, reset, rootRef: setEl };
}

/** usePlayback over local state. The index starts at `last` (the finished picture, also what reduced motion shows). */
export function useLocalPlayback(last: number, ms: number | ((i: number) => number), resetKey: string, autoplay = false) {
  const [index, setIndex] = useState(last);
  const pb = usePlayback({ index: Math.min(index, last), setIndex, last, ms, autoplay });
  const prevKey = useRef(resetKey);
  useEffect(() => {
    if (prevKey.current === resetKey) return;
    prevKey.current = resetKey;
    if (pb.reduced) setIndex(last);
    else {
      setIndex(0);
      pb.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  return { ...pb, index: Math.min(index, last), setIndex };
}

/* ---------------- tween and typewriter ---------------- */

/** Smoothly follows a numeric target (ease-out). Jumps when reduced motion is on. */
export function useTween(target: number, ms = 500): number {
  const reduced = useReducedMotion();
  const [v, setV] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  cur.current = v;
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === "undefined") {
      setV(target);
      return;
    }
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(from.current + (target - from.current) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return v;
}

/** Number of characters of `text` to show; types at `cps` characters per second and restarts when `key` changes. */
export function useTypewriter(text: string, key: string, cps = 60): number {
  const reduced = useReducedMotion();
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (reduced || typeof window === "undefined") {
      setN(text.length);
      return;
    }
    setN(0);
    const id = setInterval(() => {
      setN((c) => {
        if (c >= text.length) {
          clearInterval(id);
          return c;
        }
        return Math.min(text.length, c + Math.max(1, Math.round(cps / 30)));
      });
    }, 1000 / 30);
    return () => clearInterval(id);
  }, [key, text, cps, reduced]);
  return Math.min(n, text.length);
}

/* ---------------- transport bar ---------------- */

export function Transport({ pb, index, last, label = "step", extra }: { pb: Playback; index: number; last: number; label?: string; extra?: React.ReactNode }) {
  const pct = last > 0 ? (index / last) * 100 : 100;
  return (
    <div className="sc-transport" role="group" aria-label="animation controls">
      <button type="button" className="sc-btn primary" onClick={pb.toggle} aria-label={pb.playing ? "Pause" : "Play"}>
        <span aria-hidden="true" className="sc-ico">{pb.playing ? "❚❚" : "▶"}</span>
        {pb.playing ? "Pause" : "Play"}
      </button>
      <button type="button" className="sc-btn" onClick={pb.step} aria-label="Step forward">
        <span aria-hidden="true" className="sc-ico">▶❙</span>Step
      </button>
      <button type="button" className="sc-btn" onClick={pb.reset} aria-label="Reset animation">
        <span aria-hidden="true" className="sc-ico">↺</span>Reset
      </button>
      {extra}
      <span className="sc-progress" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      <span className="sc-count">{label} {index}/{last}</span>
    </div>
  );
}

/* ---------------- stylesheet ---------------- */

const CSS = `
.sc { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.sc-transport { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.sc-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line-2); background: var(--panel-2); color: var(--text); padding: 5px 12px; border-radius: 99px; font-size: 0.8rem; font-weight: 600; cursor: pointer; line-height: 1.2; transition: background .15s, border-color .15s, transform .1s; }
.sc-btn:hover { border-color: var(--accent-line); background: var(--panel-3); }
.sc-btn:active { transform: scale(0.97); }
.sc-btn:focus-visible { outline: none; box-shadow: var(--ring); }
.sc button:focus-visible, .sc [role="button"]:focus-visible { outline: 2px solid var(--accent) !important; outline-offset: 2px; }
.sc-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.sc-btn.primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); }
.sc-btn.warm { border-color: color-mix(in srgb, var(--warm) 55%, transparent); }
.sc-btn.warm:hover { background: color-mix(in srgb, var(--warm) 14%, transparent); }
.sc-btn.good { border-color: var(--accent-line); }
.sc-btn.good:hover { background: var(--accent-soft); }
.sc-btn:disabled { opacity: .45; cursor: default; }
.sc-ico { font-size: 0.7rem; letter-spacing: -1px; }
.sc-progress { flex: 1 1 60px; min-width: 50px; height: 4px; background: var(--panel-3); border-radius: 99px; overflow: hidden; }
.sc-progress > i { display: block; height: 100%; background: var(--accent); border-radius: 99px; transition: width .35s var(--ease); }
.sc-count { font-family: var(--font-mono), ui-monospace, monospace; font-size: 0.74rem; color: var(--muted); white-space: nowrap; }
.sc-card { background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--r); padding: 12px 14px; min-width: 0; }
.sc-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 650; }
.sc-cap { font-size: 0.86rem; color: var(--text-2); line-height: 1.5; }
.sc-mono { font-family: var(--font-mono), ui-monospace, monospace; }
.sc-chip { display: inline-block; padding: 2px 7px; border-radius: 6px; font-family: var(--font-mono), ui-monospace, monospace; font-size: 0.82rem; white-space: pre; }
.sc-caret { display: inline-block; width: 2px; height: 1.1em; background: var(--accent-strong); vertical-align: -0.2em; margin-left: 2px; animation: sc-blink 1s steps(2, start) infinite; }
.sc-fly { animation: sc-fly .6s var(--ease) both; }
.sc-pop { animation: sc-pop .45s var(--ease) both; }
.sc-in { animation: sc-in .45s var(--ease) both; }
.sc-grow { transform-origin: left center; animation: sc-grow .6s var(--ease) both; }
.sc-grow-up { transform-origin: center bottom; animation: sc-grow-up .55s var(--ease) both; }
.sc-pulse { animation: sc-pulse 1.6s ease-out infinite; }
.sc-ring { transform-box: fill-box; transform-origin: center; animation: sc-ring 1.6s ease-out infinite; }
.sc-drop { animation: sc-drop .7s var(--ease) both; }
.sc-glow { animation: sc-glow .9s ease-out both; }
@keyframes sc-blink { to { visibility: hidden; } }
@keyframes sc-fly { 0% { transform: translateY(46px) scale(1.35); opacity: 0; } 55% { opacity: 1; } 100% { transform: none; opacity: 1; } }
@keyframes sc-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes sc-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes sc-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes sc-grow-up { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes sc-pulse { 0% { box-shadow: 0 0 0 0 var(--accent-line); } 70% { box-shadow: 0 0 0 9px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
@keyframes sc-ring { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(2.4); opacity: 0; } }
@keyframes sc-drop { 0% { transform: translateY(-34px); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
@keyframes sc-glow { 0% { background: var(--accent-soft); box-shadow: 0 0 0 3px var(--accent-line); } 100% { box-shadow: 0 0 0 0 transparent; } }
@media (prefers-reduced-motion: reduce) {
  .sc *, .sc *::before, .sc *::after { animation-duration: 0.001ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  .sc-caret { visibility: visible; }
}
`;

/** One shared stylesheet; React 19 hoists and de-duplicates it by href. */
export function SimStyle() {
  return (
    <style href="sims-c-anim" precedence="default">
      {CSS}
    </style>
  );
}
