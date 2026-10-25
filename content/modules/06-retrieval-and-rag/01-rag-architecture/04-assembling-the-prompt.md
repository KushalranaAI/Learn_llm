---
title: Assembling the prompt - context, citations and cost
minutes: 7
---

Handing a lawyer a stack of unlabelled photocopies is not the same as handing them a tabbed binder with sources and dates on every page. Same pages, very different work product. Once retrieval has chosen its chunks, the way you lay them out in the prompt decides whether the model can use them, cite them and admit when they are not enough.

## A template that works

```python
SYSTEM = (
    "Answer using only the numbered sources below. "
    "Cite sources like [2] after each claim. "
    "If the sources do not contain the answer, say you could not find it."
)

def build_prompt(question, chunks):
    blocks = []
    for i, c in enumerate(chunks, start=1):
        blocks.append(f"[{i}] ({c['title']}, updated {c['date']})\n{c['text']}")
    context = "\n\n".join(blocks)
    return f"{SYSTEM}\n\nSources:\n{context}\n\nQuestion: {question}"
```

Each design choice targets a failure you will meet later in the module:

- **"Using only the sources"** pushes the model towards **grounded** answers instead of its own memory.
- **Numbered sources** make **citations** cheap to produce and to verify automatically.
- **Titles and dates** let the model prefer the newer of two conflicting passages and let users judge provenance.
- **An explicit way out** ("say you could not find it") gives the model a sanctioned answer when retrieval missed, which is the main defence against the irrelevant-context failure from the first topic.

Put the question *after* the sources. The model reads the evidence first and then sees what to do with it, and many providers cache a stable prefix (instructions), which only works if the variable parts come last.

## Order matters

Models use the beginning and end of a long context more reliably than the middle. With a handful of chunks this barely matters; with 20 it does. Two simple rules: keep $k$ small after reranking, and place the highest-scoring chunk first (or first and last). Remove near-duplicate chunks, which waste tokens and make one source look more authoritative than it is.

## The cost of a RAG request

Input tokens are the instructions, $k$ chunks of $s$ tokens each, and the question; output tokens are the answer. With prices $p_{\text{in}}$ and $p_{\text{out}}$ per million tokens:

$$
T_{\text{in}} = T_{\text{sys}} + k \cdot s + T_q, \qquad
\text{Cost} = \frac{T_{\text{in}}\, p_{\text{in}} + T_{\text{out}}\, p_{\text{out}}}{10^{6}}
$$

```steps
Worked example: cost per request and per day
Instructions $T_{\text{sys}} = 300$, $k = 5$ chunks of $s = 400$ tokens, question $T_q = 50$: $T_{\text{in}} = 300 + 2{,}000 + 50 = 2{,}350$ tokens.
---
Answer $T_{\text{out}} = 250$ tokens. Use illustrative prices $p_{\text{in}} = \$3$ and $p_{\text{out}} = \$15$ per million tokens.
---
Input: $2{,}350 \times 3 / 10^6 = \$0.00705$. Output: $250 \times 15 / 10^6 = \$0.00375$. Total $\$0.0108$ per request.
---
At 100,000 requests a day: $0.0108 \times 100{,}000 = \$1{,}080$ per day. Retrieved chunks are $2{,}000 / 2{,}350 \approx 85\%$ of input tokens, so $k$ and $s$ are the main cost levers.
```

| Change | New $T_{\text{in}}$ | Cost / request | Daily at 100k |
|---|---|---|---|
| Baseline ($k=5$, $s=400$) | 2,350 | \$0.0108 | \$1,080 |
| $k = 10$ | 4,350 | \$0.0168 | \$1,680 |
| $k = 3$ after reranking | 1,550 | \$0.0084 | \$840 |

Check the $k = 10$ row: $4{,}350 \times 3/10^6 = 0.01305$, plus $0.00375$, is $0.0168$.

## In practice

Log the exact assembled prompt for every request (with personal data handled appropriately). When an answer is wrong, the first debugging question is always "was the evidence in the prompt?", and only the logged prompt answers it. Also log the chunk IDs and scores, so you can tell a retrieval miss from a generation miss without re-running anything.

A frequent mistake is to let chunks carry **instructions**. Retrieved text is data from documents you may not control; a web page or ticket that says "ignore previous instructions" is a prompt injection. Delimit sources clearly and treat their content as untrusted, as covered in [Prompt Injection and Trust Boundaries](/learn/prompt-and-context/prompt-injection).

```quiz
{"q": "Instructions are 200 tokens, the question 40, and you send k = 8 chunks of 300 tokens. How many input tokens is the prompt?", "options": ["2,400", "2,640", "540", "2,440"], "answer": 1, "explain": "$200 + 8 \\times 300 + 40 = 2{,}640$. 2,400 counts only the chunks; 2,440 forgets the question or the instructions."}
```

```quiz
{"q": "Why give the model an explicit option to say it could not find the answer?", "options": ["It shortens outputs and saves cost", "Retrieval always returns k chunks, so when it misses, the model needs a sanctioned alternative to inventing an answer from irrelevant text", "It improves recall@k", "Providers require it for caching"], "answer": 1, "explain": "The context is never empty, even when retrieval failed. Without an allowed 'not found', the model's training pushes it to answer anyway. This changes generation behaviour, not recall."}
```
