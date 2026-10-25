// Lab: a model router for a coding-help product. Blended cost by hand, the cascade threshold trade-off, and routing under a rate limit.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

const users = { rps: 10, hardShare: 0.3, promptTokens: 800, outputTokens: 300 };

const largeOnly = (): Graph =>
  build({ users: ["users", users], large: ["llm-api", { model: "large", rateLimitRps: 200 }, "Large model"] }, "users > large");

const routed = (threshold: number, largeLimit: number): Graph =>
  build(
    {
      users: ["users", users],
      router: ["router", { threshold } as NodeConfig],
      small: ["llm-api", { model: "small", rateLimitRps: 200 }, "Small model"],
      large: ["llm-api", { model: "large", rateLimitRps: largeLimit }, "Large model"],
    },
    "users > router > small, router > large",
  );

export const routeTheTraffic: Lab = {
  slug: "route-the-traffic",
  module: "production-systems",
  title: "Route the traffic",
  product: "A coding-help assistant for developers",
  summary: "A coding assistant sends every question to its biggest model and pays for it. Compute the blended cost of routing by hand, tune a confidence threshold in a model cascade, then build a router in the sandbox that holds quality and survives a traffic spike despite a rate limit on the big model.",
  difficulty: "medium",
  minutes: 35,
  tags: ["model routing", "cascade", "cost", "quality", "rate limits", "traffic spikes", "sandbox"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A developer-tools company offers a coding-help chat. Every question currently goes to the biggest available model. It answers well, and the bill is large.

Looking at a sample of questions, the team sees two groups: about **70% are easy** (a syntax question, a short regex, a missing import) and **30% are hard** (design trade-offs, tricky debugging). A small model is more than enough for the first group, and about 25 times cheaper per token.

Two ways to use that:

- A **router** looks at the question and picks one model.
- A **cascade** always tries the small model first and only **escalates** to the large model when the small model's confidence is below a threshold.

Both rest on the same trade-off: a lower threshold sends more traffic to the cheap model (cheaper, but some hard questions get a weak answer), a higher threshold protects quality at a higher price.`,
    },
    {
      type: "math",
      title: "The blended price",
      body: r`Per request: 1,000 input tokens and 300 output tokens. Hosted prices per million tokens:

| Model | Input | Output |
|---|---|---|
| small | \$0.15 | \$0.60 |
| large | \$15 | \$75 |

If the router sends **70%** of requests to the small model and **30%** to the large model, with no extra cost for the router itself, what is the average cost per request?`,
      question: r`What is the blended cost per request, in dollars? (Five decimals.)`,
      answer: 0.01148,
      tolerance: 0.01,
      unit: "USD",
      hint: r`Cost of each model: $(1000\cdot p_\text{in} + 300\cdot p_\text{out})/10^6$. Then $0.7\,c_\text{small} + 0.3\,c_\text{large}$.`,
      solution: r`**Small model.**

$$\frac{1000\times 0.15 + 300\times 0.60}{10^6} = \frac{150 + 180}{10^6} = \$0.00033$$

**Large model.**

$$\frac{1000\times 15 + 300\times 75}{10^6} = \frac{15{,}000 + 22{,}500}{10^6} = \$0.0375$$

**Blend.**

$$0.7\times 0.00033 + 0.3\times 0.0375 = 0.000231 + 0.01125 = \$0.01148$$

Large-only costs \$0.0375 per request, so routing saves 69% even though 30% of requests still go to the big model: that 30% accounts for 98% of the remaining bill. The cost of a router is dominated by the **hard share** and the large model's price.`,
    },
    {
      type: "quiz",
      title: "What does the threshold do?",
      body: r`In a cascade, the small model produces an answer and a **confidence score**. If the score is at or above the threshold, the answer is returned. Otherwise the question is sent on to the large model, which adds its own cost and latency (the small model's attempt is wasted).`,
      question: "The team raises the threshold from 0.5 to 0.9. What happens?",
      options: [
        { text: "More questions escalate to the large model: quality goes up, and so do cost and latency", correct: true, why: "Right. A higher bar means fewer small-model answers are trusted. Escalation rate, and with it cost, climbs steeply as the threshold approaches 1." },
        { text: "Fewer questions escalate, so the system becomes cheaper and better", why: "The reverse: a stricter bar accepts fewer small-model answers." },
        { text: "Nothing changes, because the threshold only affects the confidence display", why: "The threshold is the decision rule: it determines which answers are accepted." },
        { text: "Quality goes down, because the large model is slower", why: "The large model answers hard questions better. Its slowness hurts latency, not correctness." },
      ],
    },
    {
      type: "sim",
      title: "Tune the cascade threshold",
      body: r`The simulator runs 2,000 synthetic questions through a small-then-large cascade. At threshold 0.9 almost everything escalates (quality 95%, but only a 27% saving versus large-only).

Find a threshold where **quality is at least 93%** and the cost is at least **60% below** large-only.`,
      sim: "model-cascade",
      params: { threshold: 0.9, easyShare: 0.7, separation: 2 },
      locked: ["easyShare", "separation"],
      goals: [
        { metric: "quality", op: ">=", value: 0.93, label: "Quality at least 93%" },
        { metric: "savingsVsLarge", op: ">=", value: 0.6, label: "At least 60% cheaper than large-only" },
      ],
      hints: [
        "Lower the threshold and watch savings rise and quality fall.",
        "Between about 0.65 and 0.75 both numbers are acceptable.",
        "Threshold 0.7 gives about 93.4% quality and 67% savings.",
      ],
      solution: { threshold: 0.7 },
    },
    {
      type: "sim",
      title: "A better confidence signal",
      body: r`The cascade's quality depends on how well the small model's confidence **separates** its right answers from its wrong ones (the *separation*). A calibrated or better-trained confidence signal pulls the two distributions apart.

With the threshold fixed at 0.7 and a separation of 2, quality is 93.4%. Improve the signal (for example with a trained verifier) to reach **at least 95% quality** while keeping savings **at least 65%**.`,
      sim: "model-cascade",
      params: { threshold: 0.7, easyShare: 0.7, separation: 2 },
      locked: ["threshold", "easyShare"],
      goals: [
        { metric: "quality", op: ">=", value: 0.95, label: "Quality at least 95%" },
        { metric: "savingsVsLarge", op: ">=", value: 0.65, label: "At least 65% cheaper than large-only" },
      ],
      hints: [
        "A better signal lets the cascade keep more correct small answers and escalate more wrong ones.",
        "Raise the separation and watch quality and savings improve together.",
        "A separation of 3 does it.",
      ],
      solution: { separation: 3 },
    },
    {
      type: "design",
      title: "Replace large-only with a router",
      body: r`The design below sends all traffic (10 requests/s, 30% hard) to the large model. Add a **router** with a small model and the large model behind it.

Targets: answer quality at least **0.84**, cost at most **\$0.014 per request** (large-only is \$0.0345), and a router in the design. The router's **confidence threshold** decides how much goes to the small model.`,
      starter: largeOnly(),
      palette: ["router", "llm-api", "semantic-cache", "gateway"],
      test: {
        constraints: [
          { type: "requires", kind: "router", why: "Something has to decide which model answers each query." },
          { type: "costPerRequest", maxUsd: 0.014, why: "Large-only costs about \$0.035 per request. Most queries do not need it." },
          { type: "quality", min: 0.84, why: "If too much goes to the small model, hard questions get weak answers." },
          { type: "successRate", min: 0.99 },
        ],
      },
      hints: [
        "Wire Users → Router, then the router to a small model and to a large model.",
        "A lower threshold sends more traffic to the small model. Start near 0.4.",
        "A threshold of 0.4 gives quality 0.85 at about \$0.012 per request.",
      ],
      solution: routed(0.4, 200),
    },
    {
      type: "design",
      title: "The large model has a rate limit",
      body: r`Your provider caps the large model at **4 requests/s**. The router below (threshold 0.6) sends about 5 requests/s there, so even on a normal day 12% of requests fail with 429 errors. Worse, a launch-day surge could double traffic.

Fix it so that: at least **99%** of requests succeed on a normal day **and during a 2x traffic spike**, quality stays at least **0.86**, and cost stays under **\$0.02 per request**.

You can raise the large model's rate limit (negotiate a higher tier) and/or change the router threshold: check which one buys more safety.`,
      starter: routed(0.6, 4),
      palette: ["router", "llm-api", "semantic-cache", "gateway", "fallback"],
      test: {
        constraints: [
          { type: "successRate", min: 0.99, why: "The large model is over its 4 requests/s limit, so some calls fail." },
          { type: "successRate", min: 0.99, under: { type: "trafficSpike", factor: 2 }, label: "Success rate ≥ 99% during a 2x spike", why: "Double traffic doubles the load on the rate-limited model." },
          { type: "quality", min: 0.86, why: "Sending more to the small model would stay under the limit but cost quality." },
          { type: "costPerRequest", maxUsd: 0.02 },
        ],
      },
      hints: [
        "Open the large model node and compare its load with its rate limit.",
        "At threshold 0.6 about 5 requests/s reach the large model; a 2x spike makes that about 10.5.",
        "Raise the large model's rate limit to at least 11 (12 leaves a little headroom).",
      ],
      solution: routed(0.6, 12),
    },
  ],
};
