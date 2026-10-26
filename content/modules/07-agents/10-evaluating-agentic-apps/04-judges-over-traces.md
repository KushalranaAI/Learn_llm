---
title: Judges over traces
minutes: 8
---

State checks and trace assertions cover what can be written as rules. Some things that matter in an agent's behaviour cannot: did it ask the user for the missing information instead of guessing? Did its final message accurately report what the tools returned? Did it explain a policy refusal clearly? For these, a model **judge** reads the trace, or the relevant part of it, and gives a verdict. Everything from the [LLM-as-judge](/learn/evaluation/llm-as-judge) lesson applies, plus a few problems specific to long, structured traces.

An auditor reviewing a case file is the right picture: not re-doing the work, but reading the record with a checklist and flagging where the handling went wrong.

## What judges are good for in agent evals

| Criterion | Why rules struggle | Judge question (binary) |
|---|---|---|
| Faithful reporting | Paraphrase is open-ended | "Does every factual claim in the final message match a tool result in the trace?" |
| Clarification | Many ways to ask | "When the order number was missing, did the agent ask for it before acting?" |
| Policy communication | Tone and clarity | "If the request was refused, did the agent state the reason and the alternative?" |
| Reasonable plan | Many valid plans | "Did any step make an action the user did not request?" |

Keep one judge per criterion, each with a narrow question and a short written reason before the verdict.

## Feeding a trace to a judge

Agent traces are long: tens of thousands of tokens of tool results, retries and reasoning. Dumping the whole trace into a judge prompt is expensive and makes the judge less accurate, because the relevant evidence is buried. Give each judge only what its criterion needs: the final message plus the tool results it reports on, or the user turns and the agent's first action.

A more powerful variant is the **agent-as-a-judge**: the judge is itself an agent that can open files, run code or query the environment to check claims. On a benchmark of 55 AI-development tasks with 365 requirements (DevAI), the agent-as-a-judge approach was reported to be about as reliable as human evaluators and clearly better than a plain LLM judge. It costs more per verdict, so reserve it for criteria that need inspection of the workspace.

## The maths: what judging costs

$$
\text{judge cost} = \text{trials} \times \text{criteria} \times \big(\text{input tokens} \cdot c_{\text{in}} + \text{output tokens} \cdot c_{\text{out}}\big)
$$

```steps
Whole trace versus extracted spans
500 trials, 3 judge criteria, traces averaging 30,000 tokens. Illustrative prices: \$3 per million input tokens, \$15 per million output tokens, 150 output tokens per verdict.
---
Whole trace: input $500 \times 3 \times 30{,}000 = 45$M tokens, cost $45 \times 3 = \$135$. Output $500 \times 3 \times 150 = 225{,}000$ tokens, cost $\$3.38$. Total about \$138 per run.
---
Extracted spans, 4,000 tokens per verdict: input $6$M tokens, \$18; output unchanged, \$3.38. Total about \$21 per run, 6.5 times cheaper.
---
And usually more accurate, because the judge sees the evidence instead of searching for it. Measure that on your calibration set rather than assuming it.
```

## Calibrate on traces, not on answers

Calibrate trace judges exactly as in [calibrating judges in practice](/learn/evaluation/eval-driven-development/calibrating-judges-in-practice): 100 to 200 human-labelled traces per criterion, oversampling failures, then measure true positive and true negative rates on a held-out split. Two biases are especially common with traces: judges trust confident final messages over the tool results they contradict, and judges favour long, busy trajectories as "thorough".

```sim
judge-agreement
{"accuracy": 0.85, "positionBias": 0, "verbosityBias": 0.5, "tieBand": 0, "swapAverage": false, "seed": 3}
```

Here the verbosity bias stands in for a judge that rewards long trajectories. Note kappa, then set the bias to 0. The difference is the error you would build into every agent comparison if you never checked: a verbose agent would look better than it is.

## In practice

Run cheap assertions first and call judges only on trials that pass them. Store each judge's reason with its verdict; reading 20 reasons usually shows whether the judge understood the question. Re-calibrate when the agent's trace format changes, since a judge prompt tuned for one format may misread another.

```quiz
{"q": "1,000 trials, 2 criteria, 20,000 input tokens per verdict at 3 dollars per million input tokens (ignore output). What does judging cost?", "options": ["120 dollars", "60 dollars", "12 dollars", "240 dollars"], "answer": 0, "explain": "Input tokens = 1,000 × 2 × 20,000 = 40M; × 3 dollars per million = 120 dollars. Forgetting the second criterion gives 60."}
```

```quiz
{"q": "The final message says 'refund of 42.00 issued' but the refund tool returned an error. A judge given only the final message passes it. What is the fix?", "options": ["Use a bigger judge model", "Give the judge the relevant tool results with the message and ask whether each claim matches them, or check the refund in the database with a state assertion", "Ask the agent to be more careful", "Remove the criterion"], "answer": 1, "explain": "The judge lacked the evidence. Supplying the tool outputs makes faithfulness checkable; better still, the refund itself is a state fact that a code assertion can verify for free."}
```
