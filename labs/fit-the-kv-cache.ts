// Lab: a contract-review assistant with 32k-token contexts. Work out the KV cache by hand, then make 16 chats fit on one GPU.
import type { Lab } from "./types";

const r = String.raw;

export const fitTheKvCache: Lab = {
  slug: "fit-the-kv-cache",
  module: "model-foundations",
  title: "Fit the KV cache",
  product: "A contract-review assistant with long contexts",
  summary: "A law firm's assistant reads 32,000-token contracts for 16 lawyers at once on a single H100. Compute the KV cache per conversation by hand, then use precision and GPUs to make it fit, and see why GQA matters.",
  difficulty: "medium",
  minutes: 30,
  tags: ["KV cache", "GQA", "memory", "context length", "GPU", "batching"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A law firm runs a contract-review assistant on its own hardware. Each lawyer pastes a whole contract (about **32,000 tokens**) and asks questions about it for the rest of the session. Up to **16 lawyers** are connected at once.

The model is an 8B-parameter open model with 32 layers and grouped-query attention (8 key/value heads of dimension 128). The GPU is one **H100 with 80 GB**.

During generation, every layer keeps the **keys and values** of every earlier token so it never recomputes them. That memory is the **KV cache**. It is separate from the weights, it grows with every token of every conversation, and in long-context serving it is often the thing that runs out first.

$$\text{KV bytes per token} = 2 \cdot L \cdot n_{kv} \cdot d_h \cdot b$$

where the 2 is for keys and values, $L$ the layers, $n_{kv}$ the KV heads, $d_h$ the head dimension and $b$ the bytes per number (2 for bf16).`,
    },
    {
      type: "math",
      title: "KV cache for one conversation",
      body: r`For this model: $L = 32$, $n_{kv} = 8$, $d_h = 128$, bf16 so $b = 2$ bytes.

First get the bytes per token, then multiply by the 32,768 tokens of one contract. Use $1\text{ GiB} = 2^{30}$ bytes.`,
      question: r`How many GiB of KV cache does **one** 32,768-token conversation need?`,
      answer: 4,
      tolerance: 0.02,
      unit: "GiB",
      hint: r`Per token: $2\times 32\times 8\times 128\times 2$ bytes. Then multiply by $32768 = 2^{15}$.`,
      solution: r`**Per token.**

$$2\times 32\times 8\times 128\times 2 = 131{,}072\text{ bytes} = 128\text{ KiB}$$

**Per conversation.**

$$131{,}072 \times 32{,}768 = 2^{17}\times 2^{15} = 2^{32}\text{ bytes} = 4\text{ GiB}$$

Sixteen conversations need $16\times 4 = 64$ GiB of KV cache **on top of** the weights.`,
    },
    {
      type: "math",
      title: "How many conversations fit?",
      body: r`The H100 has 80 GB of memory but a serving stack keeps about 10% free for activations, the CUDA context and fragmentation, so **72 GiB** is usable. The weights in bf16 take **14.96 GiB**. Each conversation needs the 4 GiB you just computed.`,
      question: r`How many 32k-token conversations fit beside the weights? (Give the exact quotient before rounding down.)`,
      answer: 14.26,
      tolerance: 0.03,
      hint: r`Free memory is $72 - 14.96$. Divide by 4.`,
      solution: r`$$\frac{72 - 14.96}{4} = \frac{57.04}{4} = 14.26$$

Round **down**: 14 conversations. You cannot run a fraction of a conversation, and sixteen lawyers need 16. The first connection beyond the 14th would either be refused or evict someone's cache.`,
    },
    {
      type: "sim",
      title: "Make 16 lawyers fit",
      body: r`Load the numbers: 32k tokens each, 16 conversations. On one H100 in bf16 the cache does not fit. Two levers are open to you:

- **KV precision**: store keys and values in fp8 (1 byte) or int4 (0.5 bytes) instead of bf16. Quality loss is usually small for fp8.
- **GPU count**: tensor-parallel across several GPUs adds their memory together (and costs more).

Find a setup where 16 conversations fit and the server has headroom for at least **24** conversations.`,
      sim: "kv-cache-memory",
      params: { model: "llama3-8b", attn: "native", gpu: "h100", gpuCount: 1, seqLen: 32768, batch: 16, kvBytes: "2" },
      locked: ["model", "attn", "gpu", "seqLen", "batch"],
      goals: [
        { metric: "fits", op: "==", value: 1, label: "16 conversations fit in GPU memory" },
        { metric: "maxBatch", op: ">=", value: 24, label: "Room for at least 24 conversations" },
      ],
      hints: [
        "Compare the total with the red GPU limit line. The cache is 64 GiB; the weights are 15 GiB.",
        "Halving the bytes per cache entry halves the cache.",
        "Set the KV cache to fp8 (1 byte). If you want more headroom, a second GPU also works.",
      ],
      solution: { kvBytes: "1" },
    },
    {
      type: "quiz",
      title: "Why did Llama 3 shrink the cache 4x?",
      body: r`Compare two 32-layer, 32-query-head models with $d_h = 128$: one with **multi-head attention** (32 KV heads) and Llama-3-8B with **grouped-query attention** (8 KV heads).`,
      question: "What is the effect of grouped-query attention on serving?",
      options: [
        { text: "The KV cache per token is 4 times smaller (8 KV heads instead of 32), so about 4 times more conversations fit", correct: true, why: "Right. Groups of 4 query heads share one key/value head. KV bytes per token scale with $n_{kv}$: 512 KiB with 32 heads, 128 KiB with 8. Model quality drops only slightly." },
        { text: "The weights are 4 times smaller", why: "Only the K and V projection matrices shrink, which is a small part of the weights. The big saving is in the cache." },
        { text: "Prefill gets 4 times faster", why: "Prefill is dominated by the matrix multiplications and the full set of query heads, which do not change." },
        { text: "The cache stops growing with context length", why: "It still grows linearly with context length, just with a smaller slope." },
      ],
    },
    {
      type: "sim",
      title: "A 70B model on several GPUs",
      body: r`The firm also wants a 70B model for the hardest contracts. Its weights are 131 GiB, so it needs several H100s, and at 8,192-token contexts each conversation needs 2.5 GiB of cache. The target is **32 simultaneous conversations**, with room for at least **40**.

Choose the number of GPUs and the cache precision. Each GPU you add costs money, so look for the smallest setup that works.`,
      sim: "kv-cache-memory",
      params: { model: "llama3-70b", attn: "native", gpu: "h100", gpuCount: 2, seqLen: 8192, batch: 32, kvBytes: "2" },
      locked: ["model", "attn", "gpu", "seqLen", "batch"],
      goals: [
        { metric: "fits", op: "==", value: 1, label: "32 conversations fit" },
        { metric: "maxBatch", op: ">=", value: 40, label: "Room for at least 40 conversations" },
      ],
      hints: [
        "Two GPUs hold the weights (131 GiB of 144 GiB usable) but leave almost nothing for the cache.",
        "Every extra GPU adds 72 GiB of usable memory.",
        "Three GPUs with an fp8 cache work, and so do four GPUs in bf16.",
      ],
      solution: { gpuCount: 3, kvBytes: "1" },
    },
    {
      type: "quiz",
      title: "Lost in the middle",
      body: r`Fitting a 32k-token contract in memory does not mean the model uses all of it equally well. Studies of long-context models show a U-shaped curve: facts near the **start** and **end** of the prompt are recalled much more reliably than facts in the middle.`,
      question: "Where should the assistant put the clause the lawyer is asking about, if it can choose?",
      options: [
        { text: "At the beginning or the end of the prompt, with the question next to it", correct: true, why: "Right. Positions at the edges get the most reliable use. Re-ordering retrieved passages so the best ones sit at the edges is a cheap and effective fix." },
        { text: "In the exact middle, because the model attends to the centre of the context most strongly", why: "The opposite is observed: recall dips in the middle, sometimes by 20 points or more in older models." },
        { text: "Anywhere: attention gives every token an equal chance", why: "In theory attention can reach any position, but in practice position and training data distort which tokens are used." },
        { text: "It does not matter once the KV cache fits in memory", why: "Memory only decides whether the context can be held. How well it is used is a model-quality question." },
      ],
    },
  ],
};
