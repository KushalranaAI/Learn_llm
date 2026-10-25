// Lab: a fraud-flag neuron grows into a tiny network. Compute a neuron by hand, step downhill by hand,
// find the stability limit of the learning rate, and see why XOR needs a hidden layer.
import type { Lab } from "./types";

const r = String.raw;

export const trainATinyNetwork: Lab = {
  slug: "train-a-tiny-network",
  module: "model-foundations",
  title: "Train a tiny network",
  product: "Fraud flag for a payments app",
  summary: "A payments team wants a model that flags suspicious card transactions. Compute one neuron by hand, take gradient-descent steps, find the learning rate that blows up, and add the hidden units that make XOR learnable.",
  difficulty: "easy",
  minutes: 25,
  tags: ["neuron", "loss", "gradient descent", "learning rate", "XOR", "parameters"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A payments company wants to flag suspicious card transactions before the money moves. For every transaction the app computes two numbers:

- $x_1$: how many times larger than the customer's usual spend this payment is,
- $x_2$: how many hours since the customer's last payment.

A **neuron** turns those into one suspicion score. It multiplies each input by a **weight**, adds a **bias**, and squashes the sum with an activation:

$$z = w_1 x_1 + w_2 x_2 + b, \qquad y = \sigma(z) = \frac{1}{1+e^{-z}}$$

Training means finding weights and a bias that make $y$ close to the truth (1 = fraud, 0 = fine) on past transactions. Every LLM is trained with the same loop, only with billions of weights instead of three.

In this lab you will compute a neuron yourself, take two training steps by hand, push the learning rate until training explodes, and then watch a small network solve a problem no single neuron can.`,
    },
    {
      type: "math",
      title: "One neuron, by hand",
      body: r`A transaction arrives with $x_1 = 3$ (three times the usual spend) and $x_2 = 2$ (two hours since the last payment). The current model has weights $w_1 = 0.8$, $w_2 = -0.5$ and bias $b = 0.2$.

First compute the weighted sum $z$, then pass it through the sigmoid.`,
      question: r`What suspicion score $y = \sigma(z)$ does the neuron output? (Three decimals.)`,
      answer: 0.832,
      tolerance: 0.01,
      hint: r`$z = 0.8\cdot 3 + (-0.5)\cdot 2 + 0.2$. Then $\sigma(z) = 1/(1+e^{-z})$.`,
      solution: r`**Weighted sum.**

$$z = 0.8\cdot 3 + (-0.5)\cdot 2 + 0.2 = 2.4 - 1.0 + 0.2 = 1.6$$

**Sigmoid.**

$$y = \frac{1}{1+e^{-1.6}} = \frac{1}{1 + 0.2019} = 0.832$$

The model is 83% sure this payment is fraud. Notice that the second weight is negative: a long gap since the last payment lowers the score.`,
    },
    {
      type: "math",
      title: "Two steps downhill",
      body: r`Training adjusts a weight against the slope of the loss. Take the simplest possible loss, a bowl with its lowest point at $w = 3$:

$$L(w) = (w - 3)^2, \qquad \frac{dL}{dw} = 2(w - 3)$$

The update rule is $w \leftarrow w - \eta \,\dfrac{dL}{dw}$, where $\eta$ is the **learning rate**. Start at $w = 0$ with $\eta = 0.1$.`,
      question: r`What is $w$ after **two** gradient-descent steps?`,
      answer: 1.08,
      tolerance: 0.01,
      hint: r`Step 1: slope at $w=0$ is $2(0-3) = -6$. Move by $-0.1\cdot(-6)$. Then recompute the slope at the new $w$.`,
      solution: r`**Step 1.** Slope at $w=0$: $2(0-3) = -6$.

$$w_1 = 0 - 0.1\cdot(-6) = 0.6$$

**Step 2.** Slope at $w=0.6$: $2(0.6-3) = -4.8$.

$$w_2 = 0.6 - 0.1\cdot(-4.8) = 1.08$$

The steps shrink (0.6, then 0.48) because the slope flattens as you approach the bottom. A good learning rate is one that makes steady progress without overshooting.`,
    },
    {
      type: "sim",
      title: "Find a learning rate that is fast and stable",
      body: r`The fraud model's loss surface is a long, narrow **ravine**: steep across it, shallow along it. With the current learning rate of 0.02, training barely moves along the ravine in 40 steps.

Raise the learning rate, and add **momentum** (a running average of past steps) if you need more speed. The goals: converge within 15 steps and never diverge.`,
      sim: "gradient-descent",
      params: { lr: 0.02, momentum: 0 },
      locked: ["surface", "steps", "startX", "startY"],
      goals: [
        { metric: "diverged", op: "==", value: 0, label: "Training does not diverge" },
        { metric: "stepsToConverge", op: "<=", value: 15, label: "Loss within 0.001 of the minimum in 15 steps or fewer" },
      ],
      hints: [
        "Raise the learning rate slowly. Watch the path across the ravine: at some point it starts to zig-zag.",
        "Past roughly 0.2 the loss explodes, so stay below it. Try 0.15.",
        "Momentum 0.5 lets the steps along the shallow direction build up speed without making the steep direction worse.",
      ],
      solution: { lr: 0.15, momentum: 0.5 },
    },
    {
      type: "quiz",
      title: "Why does it blow up?",
      body: r`On the ravine surface the loss is $L = \tfrac12 x^2 + 5y^2$, so the curvature along $y$ is 10. With learning rate $\eta$, each step multiplies the $y$ coordinate by $(1 - 10\eta)$.`,
      question: r`At learning rate 0.21, why does the loss explode instead of settling?`,
      options: [
        { text: r`$|1 - 10\cdot 0.21| = 1.1 > 1$, so each step overshoots the bottom by more than the last`, correct: true, why: r`Right. Each step multiplies the distance by $-1.1$: it flips sides and grows 10% every step. Stability needs $|1-10\eta| < 1$, i.e. $\eta < 2/10 = 0.2$.` },
        { text: "The surface has two minima and the iterate jumps between them", why: "That happens on a different surface (two minima). The ravine has a single minimum; the blow-up comes from overshooting the steep wall." },
        { text: "Momentum is off, and without momentum the learning rate can never exceed 0.15", why: "Momentum changes the speed along flat directions, but the stability limit comes from the curvature: $\\eta < 2/\\lambda_{\\max}$ here." },
        { text: "The gradient is zero at the start, so the optimiser takes huge steps to compensate", why: "A zero gradient gives a zero step. The gradient here is large and the step is too big for it." },
      ],
    },
    {
      type: "sim",
      title: "XOR: why one neuron is not enough",
      body: r`Fraud has a nasty pattern: a large payment **or** a very recent one is fine on its own, but a large payment **and** a very recent one is suspicious. That is an XOR-like rule: no single straight line separates the classes.

The network below has 2 inputs, **hidden** units, and 1 output. It currently has one hidden unit and gets 75% right at best. Add hidden units until it is perfect, using as few parameters as you can (at most 17).

A network with $H$ hidden units has $2H + H + H + 1 = 4H + 1$ parameters.`,
      sim: "xor-training",
      params: { hidden: 1 },
      locked: ["act", "lr", "epochs", "seed", "data"],
      goals: [
        { metric: "accuracy", op: ">=", value: 1, label: "100% of training points classified correctly" },
        { metric: "finalLoss", op: "<=", value: 0.05, label: "Final loss at most 0.05" },
        { metric: "paramCount", op: "<=", value: 17, label: "No more than 17 parameters" },
      ],
      hints: [
        "One hidden unit draws one straight boundary, which cannot separate XOR.",
        "Two hidden units can work in theory, but a bad random start may get stuck. Try three.",
        "Check the parameter count: three hidden units use 13.",
      ],
      solution: { hidden: 3 },
    },
    {
      type: "math",
      title: "Count the parameters",
      body: r`A bigger fraud model has 2 inputs, one hidden layer of **6** units and 1 output. Every hidden unit has a weight for each input plus a bias. The output unit has a weight for each hidden unit plus a bias.`,
      question: r`How many trainable parameters does the 2-6-1 network have?`,
      answer: 25,
      tolerance: 0.01,
      hint: r`Hidden layer: $6\times 2$ weights and $6$ biases. Output: $6$ weights and $1$ bias.`,
      solution: r`**Hidden layer.** $6\times 2 = 12$ weights and $6$ biases, so $18$ parameters.

**Output layer.** $6$ weights and $1$ bias, so $7$ parameters.

$$18 + 7 = 25 = 4\cdot 6 + 1$$

The same bookkeeping, layer by layer, gives the 7 billion parameters of a modern LLM. You will do exactly that in the transformer lessons.`,
    },
  ],
};
