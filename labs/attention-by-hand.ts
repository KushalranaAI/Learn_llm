// Lab: a contract-reading assistant has to resolve "it". Compute one attention weight by hand, then control how
// sharply a head focuses, and count the projection parameters of a grouped-query attention layer.
import type { Lab } from "./types";

const r = String.raw;

export const attentionByHand: Lab = {
  slug: "attention-by-hand",
  module: "model-foundations",
  title: "Attention by hand",
  product: "A contract-reading assistant",
  summary: "A legal assistant must work out what \"it\" refers to in a clause. Compute an attention weight with pencil and calculator, then tune how sharply a head focuses and count the parameters of an attention layer.",
  difficulty: "medium",
  minutes: 30,
  tags: ["attention", "softmax", "queries and keys", "causal mask", "GQA", "parameters"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A legal-tech team is building an assistant that reads contracts. One sentence in a clause goes:

> *The cat sat on the mat because **it** was tired.*

(They use a deliberately silly sentence in their test suite.) To answer "who was tired?", the model has to connect the token **it** back to **cat**. The mechanism that does this is **attention**.

Every token produces a **query** ("what am I looking for?"), a **key** ("what do I contain?") and a **value** ("what do I hand over if you pick me?"). The weight token $i$ puts on token $j$ is a softmax over scaled dot products:

$$\alpha_{ij} = \frac{\exp\left(\mathbf q_i\cdot\mathbf k_j/\sqrt{d_k}\right)}{\sum_{j'}\exp\left(\mathbf q_i\cdot\mathbf k_{j'}/\sqrt{d_k}\right)}, \qquad \text{output}_i = \sum_j \alpha_{ij}\,\mathbf v_j$$

You will do this arithmetic once by hand, then use a heatmap to control it.`,
    },
    {
      type: "math",
      title: "One attention weight",
      body: r`Strip the problem to two tokens. The query for **it** is $\mathbf q = (2,\,2,\,2,\,2)$. There are two candidate keys:

- $\mathbf k_1$ (for *cat*) $= (2,\,2,\,2,\,2)$, so $\mathbf q\cdot\mathbf k_1 = 16$
- $\mathbf k_2$ (for *mat*) $= (1,\,1,\,1,\,1)$, so $\mathbf q\cdot\mathbf k_2 = 8$

The key dimension is $d_k = 4$, so the scale factor is $\sqrt{d_k} = 2$.`,
      question: r`What attention weight does **it** put on **cat** ($\alpha_1$)? (Three decimals.)`,
      answer: 0.982,
      tolerance: 0.005,
      hint: r`Scaled scores are $16/2 = 8$ and $8/2 = 4$. Then $\alpha_1 = e^{8}/(e^{8}+e^{4}) = 1/(1+e^{-4})$.`,
      solution: r`**Scale the dot products.**

$$s_1 = \frac{16}{2} = 8, \qquad s_2 = \frac{8}{2} = 4$$

**Softmax.** Divide the top and bottom by $e^{8}$:

$$\alpha_1 = \frac{e^{8}}{e^{8} + e^{4}} = \frac{1}{1 + e^{-4}} = \frac{1}{1 + 0.0183} = 0.982$$

So the weight on *cat* is **0.982** and on *mat* it is $0.018$. Only the **gap** between scores matters: shifting both by the same amount changes nothing.`,
    },
    {
      type: "sim",
      title: "Sharpen the head",
      body: r`The heatmap shows one **head** that looks for the subject of the sentence. Row 7 is the token **it**; its largest weight is on **cat** (position 1), but at the default scale it is only about 0.77, so a lot of attention leaks onto other tokens.

The **scale** control multiplies the logits (1 is the standard $1/\sqrt{d_k}$). Raise it until **it** puts at least 0.9 of its attention on **cat**.`,
      sim: "attention-heatmap",
      params: { scale: 1 },
      locked: ["sentence", "head", "query", "causal"],
      goals: [
        { metric: "maxWeight", op: ">=", value: 0.9, label: "Largest weight at least 0.9" },
        { metric: "argmaxPos", op: "==", value: 1, label: "...and it sits on token 1 (cat)" },
      ],
      hints: [
        "A larger scale makes the gaps between logits bigger, and softmax turns bigger gaps into more extreme weights.",
        "Watch the entropy readout fall as the distribution concentrates on one token.",
        "A scale of 1.5 is enough.",
      ],
      solution: { scale: 1.5 },
    },
    {
      type: "quiz",
      title: "Why divide by the square root?",
      body: r`The dot product $\mathbf q\cdot\mathbf k$ of two vectors with independent entries of mean 0 and variance 1 has variance $d_k$. Real models use $d_k = 64$ or $128$.`,
      question: r`What goes wrong if you skip the $1/\sqrt{d_k}$ factor?`,
      options: [
        { text: r`The scores grow like $\sqrt{d_k}$, softmax saturates into near one-hot weights, and its gradients vanish`, correct: true, why: r`Right. The standard deviation of $\mathbf q\cdot\mathbf k$ is $\sqrt{d_k}$ (8 for $d_k=64$). Scores that large push softmax into its flat tails, where the gradient is nearly zero and training stalls. Dividing by $\sqrt{d_k}$ restores unit variance.` },
        { text: "The weights stop summing to 1", why: "Softmax always normalises to 1, whatever the scale of the scores." },
        { text: "The model becomes unable to attend to the same token twice", why: "Scaling does not affect which positions can be attended to. Masks do that." },
        { text: "Attention becomes uniform, so every token sees every other token equally", why: "It is the opposite: large unscaled scores make attention extremely sharp, not uniform." },
      ],
    },
    {
      type: "sim",
      title: "Soften the head",
      body: r`A different product problem: the model is *too* confident. With the scale at 1.5, **it** puts 94% of its attention on a single token, so one wrong guess ruins the answer.

Lower the scale until the attention row has at least **2.5 bits of entropy** (a broad spread over the visible tokens), while the strongest weight still points at **cat**.`,
      sim: "attention-heatmap",
      params: { scale: 1.5 },
      locked: ["sentence", "head", "query", "causal"],
      goals: [
        { metric: "entropyBits", op: ">=", value: 2.5, label: "Entropy of the row at least 2.5 bits" },
        { metric: "argmaxPos", op: "==", value: 1, label: "Largest weight still on token 1 (cat)" },
      ],
      hints: [
        "Entropy is highest when the weights are equal and falls as one weight dominates.",
        "Move the scale below 1. Watch how the maximum weight and the entropy trade off.",
        "A scale near 0.5 spreads attention widely while keeping *cat* on top.",
      ],
      solution: { scale: 0.5 },
    },
    {
      type: "math",
      title: "Parameters of one attention layer",
      body: r`The contract assistant runs on a model with $d = 4096$, 32 query heads of dimension 128, and **grouped-query attention** with only 8 key/value heads.

The layer has four projection matrices (no biases):

- $W_Q: 4096 \to 32\times 128 = 4096$
- $W_K: 4096 \to 8\times 128 = 1024$
- $W_V: 4096 \to 1024$
- $W_O: 4096 \to 4096$`,
      question: r`How many parameters are in the four projections of one attention layer?`,
      answer: 41943040,
      tolerance: 0.01,
      hint: r`Each matrix has $d_\text{in}\times d_\text{out}$ entries. $W_Q$ and $W_O$ are square; $W_K$ and $W_V$ are $4096\times 1024$.`,
      solution: r`$$W_Q = W_O = 4096^2 = 16{,}777{,}216$$

$$W_K = W_V = 4096\times 1024 = 4{,}194{,}304$$

$$\text{total} = 2\times 16{,}777{,}216 + 2\times 4{,}194{,}304 = 41{,}943{,}040 \approx 41.9\text{M}$$

With full multi-head attention ($W_K, W_V$ also $4096\times 4096$) the total would be $67.1$M. Grouped-query attention saves 25M parameters per layer, and, more importantly, makes the KV cache 4 times smaller.`,
    },
    {
      type: "quiz",
      title: "Reading the future",
      body: r`When the model is *generating* the sentence token by token, the token **it** can only look at tokens that already exist. The attention matrix is lower-triangular: row $i$ may use columns $j \le i$.`,
      question: "How is this enforced inside the softmax?",
      options: [
        { text: r`Scores for future positions are set to $-\infty$ before the softmax, so their weights are exactly 0`, correct: true, why: r`Right. Adding a mask of $0$ (allowed) or $-\infty$ (forbidden) to the logits makes $e^{-\infty}=0$ and the remaining weights renormalise.` },
        { text: "Future tokens are deleted from the input before each step", why: "Training processes the whole sequence in one pass for efficiency, so the future tokens are present. The mask hides them." },
        { text: "The weights are multiplied by 0 after the softmax", why: "Zeroing after the softmax would leave the remaining weights summing to less than 1. The mask goes before the softmax so they renormalise." },
        { text: "Future keys are given a very large negative value vector", why: "The mask acts on the attention *scores*, not on the key or value vectors." },
      ],
    },
  ],
};
