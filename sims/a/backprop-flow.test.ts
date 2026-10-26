import { describe, expect, it } from "vitest";
import { backpropFlow } from "./backprop-flow";

const run = (p: Record<string, number | string>) => backpropFlow.compute({ ...backpropFlow.defaults, ...p });

describe("backprop-flow", () => {
  it("one update lowers the loss (small learning rate)", () => {
    for (const lr of [0.1, 0.5, 1]) {
      const m = run({ lr });
      expect(m.lossAfter).toBeLessThan(m.loss);
    }
  });
  it("training many rounds drives the loss towards zero", () => {
    expect(run({ iterations: 200, lr: 2 }).loss).toBeLessThan(0.01);
    expect(run({ iterations: 200, lr: 2 }).loss).toBeLessThan(run({ iterations: 0 }).loss);
  });
  it("gradients match a numerical derivative of the loss (chain rule is right)", () => {
    // d(loss)/d(lr) at lr→0 for one update equals −|grad|²; compare a tiny finite step
    const base = run({ lr: 1e-6 });
    const predicted = base.loss - 1e-6 * base.gradNorm ** 2;
    expect(Math.abs(base.lossAfter - predicted)).toBeLessThan(1e-10);
  });
  it("a target equal to the output gives near-zero gradient", () => {
    const y = run({}).output;
    expect(run({ target: Math.round(y * 20) / 20 }).gradNorm).toBeLessThan(0.02);
  });
});
