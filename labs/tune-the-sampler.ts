// Lab: a product-description writer that must be exact for facts and lively for copy. Temperature and top-p, by hand and in the sim.
import type { Lab } from "./types";

const r = String.raw;

export const tuneTheSampler: Lab = {
  slug: "tune-the-sampler",
  module: "model-foundations",
  title: "Tune the sampler",
  product: "An e-commerce copy assistant",
  summary: "One assistant answers factual stock questions and writes playful product copy. Compute a temperature-scaled softmax by hand, then pick sampler settings that are boringly exact for facts and varied for creative text.",
  difficulty: "easy",
  minutes: 20,
  tags: ["sampling", "temperature", "top-p", "top-k", "entropy", "softmax"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`An online shop has one assistant with two jobs:

1. **Factual answers**: "What is the capital of France?"-style questions about delivery times, sizes and policies. These must be the same every time.
2. **Creative copy**: product descriptions and marketing blurbs. Ten copies of the same sentence would be useless.

At each step the model produces a **logit** $z_i$ for every token. Decoding turns logits into probabilities with a **temperature** $T$ and then draws one token:

$$p_i = \frac{e^{z_i/T}}{\sum_j e^{z_j/T}}$$

Low $T$ sharpens the distribution (at $T\to 0$ it is greedy argmax); high $T$ flattens it. **Top-k** and **top-p** (nucleus) sampling additionally cut off the unlikely tail before drawing.

The same model serves both jobs; only the sampler settings differ.`,
    },
    {
      type: "math",
      title: "Temperature by hand",
      body: r`Two candidate next tokens have logits $z_A = 5.0$ and $z_B = 3.5$. We compare the probability of the top token **A** at temperature $T = 0.5$.

With only two candidates the softmax simplifies to a sigmoid of the logit gap:

$$p_A = \frac{1}{1 + e^{-(z_A - z_B)/T}}$$`,
      question: r`What is $p_A$ at $T = 0.5$? (Four decimals.)`,
      answer: 0.9526,
      tolerance: 0.002,
      hint: r`The gap is $1.5$. Divide by $T=0.5$ to get $3$, then $1/(1+e^{-3})$.`,
      solution: r`**Gap and scaling.**

$$\frac{z_A - z_B}{T} = \frac{1.5}{0.5} = 3$$

**Sigmoid.**

$$p_A = \frac{1}{1 + e^{-3}} = \frac{1}{1 + 0.0498} = 0.9526$$

For comparison, at $T = 1$ the gap is 1.5 and $p_A = 1/(1+e^{-1.5}) = 0.818$; at $T = 2$ it is $0.679$. Halving the temperature doubled the effective gap.`,
    },
    {
      type: "sim",
      title: "Make facts deterministic",
      body: r`The factual prompt is "The capital of France is". At temperature 1 with no top-p filter, the sampler still sometimes drifts to a low-probability token: over 20 draws you can see more than one word.

Find settings that make the factual answer effectively deterministic: **entropy of the final distribution below 0.05 bits**, and **all 20 draws identical**.`,
      sim: "sampling",
      params: { prompt: "capital", temperature: 1, topK: 0, topP: 1 },
      locked: ["prompt", "seed"],
      goals: [
        { metric: "entropyBits", op: "<=", value: 0.05, label: "Entropy at most 0.05 bits" },
        { metric: "uniqueIn20", op: "==", value: 1, label: "All 20 draws are the same token" },
      ],
      hints: [
        "Lower the temperature and watch the entropy fall.",
        "Because the top logit is far ahead of the rest, even a moderate temperature concentrates almost all mass on one token.",
        "Temperature 0.3 does it. Temperature 0 is greedy decoding, which also works.",
      ],
      solution: { temperature: 0.3 },
    },
    {
      type: "quiz",
      title: "Top-p versus top-k",
      body: r`For creative text you want to cut the long tail of nonsense tokens but keep real choices. Two common tools:

- **top-k**: keep the $k$ most likely tokens.
- **top-p**: keep the smallest set of top tokens whose probabilities add up to at least $p$.`,
      question: "Why do many practitioners prefer top-p over a fixed top-k?",
      options: [
        { text: "The nucleus adapts: when the model is sure it keeps 1-2 tokens, when it is unsure it keeps many", correct: true, why: "Right. After \"The capital of France is\" a 95% nucleus may contain a single token; after \"Once upon a time there was a\" it may contain eight. A fixed $k$ is too loose for the first and too tight for the second." },
        { text: "Top-p is faster to compute than top-k", why: "Both need a sort of the probabilities. Speed is not the reason; adaptivity is." },
        { text: "Top-p removes the need for a temperature", why: "They are independent knobs. Temperature reshapes the whole distribution; top-p truncates it afterwards." },
        { text: "Top-k can return tokens that were not in the model's vocabulary", why: "Both methods choose among real vocabulary tokens." },
      ],
    },
    {
      type: "sim",
      title: "Make copy lively, not unhinged",
      body: r`Now the creative prompt "Once upon a time, there was a". At low temperature the model keeps repeating the same two or three words. The copy team wants **variety** (at least 6 different tokens in 20 draws) but also wants the last two junk tokens of the tail cut off (**at most 8 tokens kept** after filtering).

Tune temperature and top-p.`,
      sim: "sampling",
      params: { prompt: "story", temperature: 0.3, topK: 0, topP: 1 },
      locked: ["prompt", "seed", "topK"],
      goals: [
        { metric: "uniqueIn20", op: ">=", value: 6, label: "At least 6 different tokens in 20 draws" },
        { metric: "keptTokens", op: "<=", value: 8, label: "At most 8 candidates survive filtering" },
      ],
      hints: [
        "Temperature controls how much variety you get, top-p controls how much tail you allow.",
        "Raise the temperature above 1 for variety, then lower top-p until the tail is trimmed.",
        "Try temperature 1.2 with top-p 0.9.",
      ],
      solution: { temperature: 1.2, topP: 0.9 },
    },
    {
      type: "math",
      title: "Entropy in bits",
      body: r`**Entropy** measures how spread out a distribution is: $H = -\sum_i p_i\log_2 p_i$. A sure thing has $H = 0$; a fair coin has $H = 1$ bit.

After filtering, a three-token distribution looks like $p = (0.5,\; 0.25,\; 0.25)$.`,
      question: r`What is its entropy in bits?`,
      answer: 1.5,
      tolerance: 0.01,
      unit: "bits",
      hint: r`$\log_2 0.5 = -1$ and $\log_2 0.25 = -2$.`,
      solution: r`$$H = -\left[0.5\log_2 0.5 + 0.25\log_2 0.25 + 0.25\log_2 0.25\right]$$

$$H = 0.5\cdot 1 + 0.25\cdot 2 + 0.25\cdot 2 = 0.5 + 0.5 + 0.5 = 1.5 \text{ bits}$$

Equivalent reading: choosing among this distribution is as hard as choosing among $2^{1.5} \approx 2.8$ equally likely tokens. Factual prompts should sit near 0 bits; creative prompts commonly run at 2-3 bits.`,
    },
  ],
};
