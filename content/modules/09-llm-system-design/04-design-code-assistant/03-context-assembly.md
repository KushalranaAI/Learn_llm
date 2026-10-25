---
title: "Deep dive: assembling context from the repository"
minutes: 9
---

A code model sees only what you put in its window. The developer, meanwhile, has the whole repository in their head: the class defined two files away, the helper they wrote yesterday, the test that pins down the expected behaviour. **Context assembly** is the job of choosing, within a fixed token budget, the pieces of the repository that make the right completion most likely. In practice it moves acceptance rate more than switching between two similar models does.

Think of packing a carry-on bag. The bag has a hard size limit. Some items are essential (the current file around the cursor), some are very useful per kilogram (a short definition of the type you are using), and some are bulky with little value (a long, unrelated config file). You pack by value per unit of space.

## The budget

For inline completion the budget is about 2,000 tokens, chosen because prefill time and cost grow with it while acceptance flattens out. A typical split:

| Slot | Tokens | Contents |
|---|---|---|
| Header | 50 | Language, file path, FIM sentinel tokens |
| Prefix | up to 1,100 | Code above the cursor, about 110 lines at ~10 tokens per line, nearest lines kept first |
| Suffix | up to 350 | Code below the cursor, about 35 lines |
| Snippets | 500 | Pieces from other files, chosen by the ranker below |
| **Total** | **2,000** | |

The prefix and suffix are trimmed from the far end: lines adjacent to the cursor matter most. If the file is short, the unused prefix budget flows to snippets.

## Scoring candidate snippets

Candidates come from three cheap sources: other open tabs and recently edited files (the plugin already has them), symbols the language server resolves from the current scope (the definition of `Header`, the signature of `read_lines`), and the embedding index for anything else. Each candidate gets a relevance score. A simple, fast, surprisingly strong score is the **Jaccard similarity** of identifier sets:

$$
J(A, B) = \frac{|A \cap B|}{|A \cup B|}
$$

where $A$ is the set of identifiers in the code near the cursor and $B$ the set in the candidate snippet. Worked example: near the cursor $A = \{\texttt{user}, \texttt{id}, \texttt{fetch}, \texttt{cache}, \texttt{get}\}$ and a snippet has $B = \{\texttt{user}, \texttt{id}, \texttt{cache}, \texttt{store}\}$. The intersection has 3 items, the union 6, so $J = 3/6 = 0.5$.

Production rankers blend several signals: Jaccard, embedding cosine similarity, "resolved by the language server" (a strong bonus: the model needs that definition), recency of edit, and same-directory proximity.

## Packing: a small knapsack

Given candidates $i$ with score $v_i$ and token length $w_i$, choose a set $S$ that maximises total score within the snippet budget $W$:

$$
\max_{S} \sum_{i \in S} v_i \quad \text{subject to} \quad \sum_{i \in S} w_i \le W
$$

This is the 0/1 knapsack problem. Exact solutions are unnecessary at this size; the greedy rule "take the highest $v_i / w_i$ first while it fits" is fast and close to optimal when items are small relative to $W$.

```steps
Greedy packing into a 500-token snippet budget
Candidates (score, tokens): `read_lines` helper (0.30, 90), `Header` class (0.50, 180), `parse_footer` sibling (0.45, 200), parser test (0.40, 260), config loader (0.10, 150).
---
Score per token: `read_lines` 0.00333, `Header` 0.00278, `parse_footer` 0.00225, test 0.00154, config 0.00067.
---
Take `read_lines` (90 tokens used), then `Header` (270), then `parse_footer` (470).
---
The test needs 260 more tokens (730 > 500), skip. The config needs 150 (620 > 500), skip. Final: three snippets, 470 tokens, total score 1.25.
```

```python
def pack(cands, budget):
    """cands: list of (name, score, tokens). Greedy by score per token."""
    chosen, used = [], 0
    for name, v, w in sorted(cands, key=lambda c: c[1] / c[2], reverse=True):
        if used + w <= budget:
            chosen.append(name)
            used += w
    return chosen, used

cands = [("read_lines", .30, 90), ("Header", .50, 180), ("parse_footer", .45, 200),
         ("test", .40, 260), ("config", .10, 150)]
print(pack(cands, 500))   # (['read_lines', 'Header', 'parse_footer'], 470)
```

Order matters as well as selection. Snippets go at the top of the prompt as commented blocks labelled with their file path, most relevant last so it sits nearest the prefix; the prefix and suffix stay in their natural positions because the model was trained on real files.

## Chat assembles more, and differently

Chat questions are about intent ("where do we retry failed payments?"), so retrieval leads with the question, not the cursor. The assembler runs a hybrid search (identifiers through a keyword index, intent through embeddings), follows the symbol graph one hop (definitions and callers of what it found), reranks, and packs about 8,000 tokens. Because chat can take a few hundred milliseconds for this, it can also let the model ask for more: a tool call to open a file or search again. That is the agentic version, covered in the [agents module](/learn/agents/agent-loop).

## In practice

The common mistake is spending the budget on volume. Doubling inline context from 2,000 to 4,000 tokens doubles prefill cost (and adds roughly 80 ms on the self-hosted model sized in the first topic) for a small gain, while a well-chosen 180-token definition can turn a wrong completion into a right one. Log which snippets were included in accepted versus rejected completions; that log is the training data for a better ranker.

```quiz
{"q": "Near the cursor the identifiers are {order, total, tax, apply}. A snippet contains {order, tax, rate}. What is their Jaccard similarity?", "options": ["2/7", "2/5", "2/3", "2/4"], "answer": 1, "explain": "Intersection is {order, tax}: 2 items. Union is {order, total, tax, apply, rate}: 5 items. $J = 2/5$. Using 7 adds the set sizes (4 + 3) instead of taking the union, double-counting shared names."}
```

```quiz
{"q": "Snippet budget 300 tokens. Candidates: A (score 0.6, 250 tokens), B (0.35, 120), C (0.3, 150). What does the greedy score-per-token rule choose, and is it optimal?", "options": ["A only; optimal", "B and C; optimal (total 0.65 vs 0.6)", "A and B; it fits", "C only"], "answer": 1, "explain": "Ratios: B 0.0029, A 0.0024, C 0.0020. Greedy takes B (120), cannot fit A (370 > 300), takes C (270). Total 0.65 beats A alone (0.6), and A with anything else exceeds 300. A and B would need 370 tokens."}
```
