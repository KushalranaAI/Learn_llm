// One neuron: weighted sum, bias, activation. The reference example for how a simulation is written.
import NeuralNetDiagram from "../nn-diagram";
import { LineChart, StackBar } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";

const ACT: Record<string, (z: number) => number> = {
  relu: (z) => Math.max(0, z),
  sigmoid: (z) => 1 / (1 + Math.exp(-z)),
  tanh: (z) => Math.tanh(z),
  linear: (z) => z,
};

function compute(p: Params) {
  const z = num(p, "w1") * num(p, "x1") + num(p, "w2") * num(p, "x2") + num(p, "b");
  return { z, y: ACT[str(p, "act")](z) };
}

function View({ params }: SimViewProps) {
  const f = ACT[str(params, "act")];
  const w1 = num(params, "w1"), w2 = num(params, "w2"), b = num(params, "b"), x2 = num(params, "x2");
  // output as x1 sweeps from -3 to 3, the other input held where it is
  const xs = Array.from({ length: 61 }, (_, i) => -3 + i * 0.1);
  const marker = Math.round((num(params, "x1") + 3) / 0.1);
  const x1 = num(params, "x1");
  const z = w1 * x1 + w2 * x2 + b;
  const y = f(z);
  return (
    <>
      <NeuralNetDiagram
        height={230}
        range={[-3, 3]}
        showWeights
        caption="a perceptron: weigh, sum, bend"
        layers={[
          { title: "inputs", nodes: [{ value: x1, label: "x₁" }, { value: x2, label: "x₂" }, { value: 1, label: "bias", bias: true }] },
          { title: "sum Σ", nodes: [{ value: z, label: "z = Σ wᵢxᵢ + b" }] },
          { title: "activation σ", nodes: [{ value: y, label: "y" }] },
        ]}
        weights={[[[w1, w2, b]], [[1]]]}
      />
      <StackBar
        parts={[
          { label: "w₁·x₁", value: Math.abs(w1 * num(params, "x1")) },
          { label: "w₂·x₂", value: Math.abs(w2 * x2) },
          { label: "|b|", value: Math.abs(b) },
        ]}
      />
      <LineChart
        x={xs.map((v) => +v.toFixed(1))}
        series={[{ name: "output y", values: xs.map((x1) => f(w1 * x1 + w2 * x2 + b)) }]}
        xLabel="input x₁ (x₂ held fixed)"
        marker={marker}
        height={200}
      />
    </>
  );
}

export const neuron: SimDef = {
  id: "neuron",
  title: "One neuron: a weighted sum, then a bend",
  summary: "Change the weights, bias and activation and watch how one neuron turns two inputs into one output.",
  module: "model-foundations",
  tags: ["neuron", "weights", "bias", "activation"],
  params: [
    { key: "x1", label: "Input x₁", kind: "range", min: -3, max: 3, step: 0.1 },
    { key: "x2", label: "Input x₂", kind: "range", min: -3, max: 3, step: 0.1 },
    { key: "w1", label: "Weight w₁", kind: "range", min: -3, max: 3, step: 0.1 },
    { key: "w2", label: "Weight w₂", kind: "range", min: -3, max: 3, step: 0.1 },
    { key: "b", label: "Bias b", kind: "range", min: -3, max: 3, step: 0.1 },
    {
      key: "act",
      label: "Activation",
      kind: "select",
      options: [
        { value: "relu", label: "ReLU" },
        { value: "sigmoid", label: "Sigmoid" },
        { value: "tanh", label: "tanh" },
        { value: "linear", label: "None (linear)" },
      ],
    },
  ],
  defaults: { x1: 1, x2: -0.5, w1: 1.2, w2: 0.8, b: 0.1, act: "relu" },
  metrics: [
    { key: "z", label: "Weighted sum z", format: "num" },
    { key: "y", label: "Output y", format: "num" },
  ],
  compute,
  View,
  math: `A neuron computes a **weighted sum** of its inputs plus a **bias**, then passes it through an **activation** $\\sigma$:

$$z = w_1 x_1 + w_2 x_2 + b, \\qquad y = \\sigma(z)$$

With the defaults: $z = 1.2\\cdot 1 + 0.8\\cdot(-0.5) + 0.1 = 0.9$ and $\\text{ReLU}(0.9) = 0.9$.

| Activation | $\\sigma(z)$ |
|---|---|
| ReLU | $\\max(0, z)$ |
| Sigmoid | $1/(1+e^{-z})$ |
| tanh | $(e^z-e^{-z})/(e^z+e^{-z})$ |

Without a non-linear $\\sigma$, stacking neurons only ever gives another linear function, so depth would add nothing.`,
  explain: (p, m) =>
    m.z < 0 && str(p, "act") === "relu"
      ? "The weighted sum is negative, so ReLU outputs exactly 0: this neuron is 'off' for these inputs, and no gradient flows through it."
      : `z = ${m.z.toFixed(2)}. The weights decide how much each input counts, the bias shifts the threshold, the activation bends the result.`,
};
