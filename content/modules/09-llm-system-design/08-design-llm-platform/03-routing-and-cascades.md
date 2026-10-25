---
title: Routing and cascades: paying for the big model only when needed
minutes: 10
---

A hospital does not send every patient straight to a specialist. A triage nurse sees everyone first, handles the simple cases, and refers the hard ones. Most patients are seen quickly and cheaply, and the specialist's time goes where it matters.

A platform can treat model calls the same way. Two patterns exist. A **router** decides up front, before any model runs, which model a request should go to, using the route name, the tenant's settings, or a small classifier that predicts difficulty. A **cascade** sends the request to the cheap model first, checks the answer with a **verifier** (a confidence score, a schema check, a judge model, a test), and **escalates** to the large model only when the check fails. Routing costs one model call per request; a cascade sometimes costs two, but it decides with the answer in hand rather than guessing from the question. The general treatment is in [Choosing and Routing Models](/learn/production-systems/model-routing); here we put numbers on it for the platform.

## Expected cost

Let $c_s$ and $c_\ell$ be the cost of one request on the small and large model, and $a$ the fraction of requests handled by the small model (the **acceptance rate**). For a router that sends a fraction $a$ to the small model:

$$
\mathbb{E}[c_{router}] = a\,c_s + (1-a)\,c_\ell
$$

For a cascade, every request pays for the small model, and the fraction $1-a$ that fails the check also pays for the large one:

$$
\mathbb{E}[c_{cascade}] = c_s + (1-a)\,c_\ell
$$

With the platform's typical request (2,000 input, 400 output tokens) at the hypothetical prices:

- $c_s = 2{,}000 \times \$0.10/10^6 + 400 \times \$0.40/10^6 = \$0.00020 + \$0.00016 = \$0.00036$
- $c_\ell = 2{,}000 \times \$1.00/10^6 + 400 \times \$4.00/10^6 = \$0.0020 + \$0.0016 = \$0.0036$

At $a = 0.7$, the router costs $0.7 \times 0.00036 + 0.3 \times 0.0036 = \$0.001332$ per request and the cascade $0.00036 + 0.3 \times 0.0036 = \$0.00144$. Over 20 million requests a day that is \$26,640 against \$28,800, and both are far below \$72,000 for sending everything to the large model. The cascade's extra \$2,160 a day buys a decision made on the actual answer, which usually lets it accept a larger fraction safely.

## Expected quality and latency

Let $q_s$ be the small model's quality on the requests it keeps and $q_\ell$ the large model's quality on the requests it receives. Overall quality is the mixture:

$$
Q = a\,q_s + (1-a)\,q_\ell
$$

If the verifier is good, the small model keeps only requests it does well on: say $q_s = 0.93$ on accepted traffic and $q_\ell = 0.95$ on escalated traffic. Then $Q = 0.7 \times 0.93 + 0.3 \times 0.95 = 0.936$, against 0.95 for sending everything to the large model. Whether 1.4 points of quality is worth a 63% cost cut is a product decision, which is why the threshold is set per route, not globally.

Latency in a cascade is paid twice for escalated requests. With mean latencies $\ell_s = 0.4$ s and $\ell_\ell = 1.5$ s:

$$
\mathbb{E}[\ell_{cascade}] = \ell_s + (1-a)\,\ell_\ell = 0.4 + 0.3 \times 1.5 = 0.85 \text{ s}
$$

The mean looks fine, but the escalated 30% take 1.9 s, so the p90 and p99 get worse than calling the large model directly. Interactive routes with a tight p95 often prefer an up-front router; batch and back-office routes prefer cascades.

```sim
model-cascade
```

Move the routing threshold from "send almost everything to the small model" to "send almost everything to the large one" and watch three lines: cost per request falls steadily as more traffic stays small, while quality holds nearly flat at first and then drops once the small model starts keeping requests it gets wrong. Find the knee where quality starts falling: that is roughly where a sensible threshold sits. Then compare the latency at that threshold with the all-large setting.

## Who decides, in a platform

| Mechanism | Decided by | Good for | Risk |
|---|---|---|---|
| Static route per use case | Team, in config | Most traffic; predictable | Over-paying when tasks vary in difficulty |
| Classifier router | Platform, per request | Mixed-difficulty chat traffic | Classifier drift; needs labelled data |
| Cascade with verifier | Platform, after small answer | Tasks with cheap checks (schema, tests, citations) | Doubled latency on escalations |
| Tenant override | Team | Quality-critical routes | Cost creep if never reviewed |

The platform's job is to make routing a **named route** that teams reference (`route=summarise-ticket`) rather than a model name. Then the platform can change which model serves the route, run an A/B comparison or move to a cheaper model behind the same name, with the owning team's agreement and an evaluation set as the gate.

## Measuring acceptance safely

You cannot set $a$ from intuition. The standard method is **shadow evaluation**: for a sample of traffic on a route, call both models, score both answers (human labels or a calibrated judge), and plot quality against the verifier's threshold. The threshold where quality on accepted traffic is within your tolerance of the large model gives you $a$. Re-run it whenever either model changes, because a new small model version shifts the whole curve.

## In practice

Most platforms get the majority of their savings from boring static routing: classification, extraction and short summaries move to the small tier and stay there. Dynamic routers come later, for high-volume chat routes. A common mistake is measuring cascade savings without counting the verifier: if the check is itself a model call costing $c_v$, the cascade cost is $c_s + c_v + (1-a)c_\ell$, and a large-model judge can erase the savings entirely.

```quiz
{"q": "Small requests cost \\$0.00036 and large ones \\$0.0036. A cascade accepts 80% of answers from the small model. What is its expected cost per request?", "options": ["\\$0.000288", "\\$0.00108", "\\$0.00072", "\\$0.001008"], "answer": 1, "explain": "Every request pays the small model, and the escalated 20% also pay the large: $0.00036 + 0.2 \\times 0.0036 = 0.00036 + 0.00072 = \\$0.00108$. \\$0.001008 is the router formula $0.8 c_s + 0.2 c_\\ell$, which forgets that a cascade runs the small model on every request; \\$0.00072 counts only the escalations."}
```

```quiz
{"q": "An interactive route has a strict p95 latency target. The small model takes 0.4 s and the large 1.5 s; 30% of requests would escalate. Why might an up-front router beat a cascade here even at slightly higher cost?", "options": ["Routers always produce better answers", "Escalated cascade requests take about 1.9 s, so 30% of traffic exceeds what the large model alone would take, hurting p95", "Cascades cannot stream", "Routers do not need evaluation data"], "answer": 1, "explain": "With 30% escalations, more than 5% of requests take $0.4 + 1.5 = 1.9$ s, so p95 lands in the slow group. A router sends each request to one model, so p95 is bounded by the large model's latency. Mean latency (0.85 s) hides this."}
```
