---
title: KV-cache traffic and measuring efficiency (MBU, MFU)
minutes: 8
---

So far, decode time was "weights divided by bandwidth". That is right for short contexts. With long conversations and big batches, a second stream of bytes catches up and can overtake the weights: the **KV cache**. Every decode step must read the keys and values of every previous token of every sequence in the batch, and unlike weights, those reads cannot be shared between sequences.

This topic adds the KV term to the decode formula, then shows how engineers check how close a real system is to the hardware limit.

## Bytes of KV per token

For a model with $L$ layers, $h_{kv}$ key-value heads of dimension $d_h$, storing $b_{kv}$ bytes per number, each token of context holds a key and a value vector per layer:

$$
s_{kv} = 2 \cdot L \cdot h_{kv} \cdot d_h \cdot b_{kv} \quad \text{bytes per token}
$$

Llama 3 8B has $L = 32$, $h_{kv} = 8$ (grouped-query attention), $d_h = 128$. In BF16:

$$
s_{kv} = 2 \times 32 \times 8 \times 128 \times 2 = 131{,}072 \text{ bytes} = 128 \text{ KiB per token}
$$

A decode step with $B$ sequences of average context $\bar{n}$ reads about $B \cdot \bar{n} \cdot s_{kv}$ bytes of KV, so the full step-time estimate becomes

$$
t_{step} \approx \frac{N b + B\, \bar{n}\, s_{kv}}{\eta_m \beta}
$$

with $\eta_m$ the achieved fraction of peak bandwidth $\beta$.

```steps
When the KV cache outweighs the model
8B model in BF16, weights $N b = 16.06$ GB, H100 at approximately 3.35 TB/s (take $\eta_m = 1$ to see the ideal).
---
Batch 32, context 4,000 tokens each: KV bytes $= 32 \times 4000 \times 131{,}072 = 16.78 \times 10^{9}$, about 16.8 GB, slightly more than the weights.
---
Step time: $(16.06 + 16.78)\times10^{9} / 3.35\times10^{12} = 9.8$ ms, double the 4.8 ms for weights alone.
---
Per-user speed: $1/0.0098 \approx 102$ tokens/s; server throughput $32/0.0098 \approx 3{,}270$ tokens/s.
---
Same batch at 500-token contexts: KV is 2.1 GB, step about 5.4 ms. Context length, not just batch size, sets TPOT.
```

This is also why models moved from multi-head attention to grouped-query attention. Llama 2 7B uses 32 KV heads, so its $s_{kv}$ is four times larger, 512 KiB per token: the same batch at 4,000 tokens would read about 67 GB of KV per step, and would not even fit in an 80 GB GPU next to its weights.

## Measuring how close you are: MBU and MFU

Two ratios compare measured performance with the hardware's peaks.

**Memory bandwidth utilisation (MBU)** is for memory-bound phases (decode):

$$
\text{MBU} = \frac{\text{bytes moved per step} / t_{step}}{\beta}
$$

**Model FLOPs utilisation (MFU)** is for compute-bound phases (prefill and training):

$$
\text{MFU} = \frac{\text{model FLOPs per second achieved}}{P}
$$

"Model FLOPs" means the $2N$-per-token count, not whatever the hardware actually executed, so work wasted on recomputation does not inflate the score.

```steps
Computing MBU and MFU from measurements
Measured: the 8B BF16 model decodes at 150 tokens/s for a single user with a short context on an H100.
---
Bytes per second: $150 \times 16.06\times10^{9} = 2.41 \times 10^{12}$ B/s.
---
MBU $= 2.41 / 3.35 = 0.72$, about 72% of peak bandwidth. Respectable: the remaining gap is kernel launch overhead, small element-wise operations and imperfect overlap.
---
Measured prefill: a 4,000-token prompt takes 110 ms. Model FLOPs $= 2 \times 8.03\times10^{9} \times 4000 = 6.42\times10^{13}$, so achieved rate $= 6.42\times10^{13}/0.110 = 5.84\times10^{14}$ FLOP/s.
---
MFU $= 584/989 = 0.59$, about 59%.
```

Notice that MFU during decode is tiny by design: the 150 tokens/s above is $150 \times 1.6\times10^{10} = 2.4\times10^{12}$ FLOP/s, a quarter of a percent of peak. Reporting MFU for decode makes a well-tuned system look broken; report MBU instead.

## See it

```sim
roofline
{"gpu": "h100", "model": "llama3-8b", "tokens": 32, "precision": "bf16"}
```

This models only the weight matrices, which is exactly the part that batching helps. Read the attainable TFLOP/s at 32 tokens, then remember that in a real step the KV reads from the walkthrough add memory time on top without adding much arithmetic, pulling the true point down and to the left. To feel the KV term directly, open the KV-cache sizing tool from the foundations module, or the batching sim in the next lesson, which includes it.

| Model (BF16 KV) | $L$ | $h_{kv}$ | $d_h$ | KV per token |
|---|---|---|---|---|
| Llama 2 7B (MHA) | 32 | 32 | 128 | 512 KiB |
| Llama 3 8B (GQA) | 32 | 8 | 128 | 128 KiB |
| Llama 3 70B (GQA) | 80 | 8 | 128 | 320 KiB |

## In practice

Production engines expose the numbers you need: running batch size, average context length, KV-cache occupancy. Multiply them out with the formula above and you can predict TPOT before a load test. Three common levers on the KV term: choose models with fewer KV heads, quantize the KV cache to 8 bits (halving $b_{kv}$), and cap context length per tier of service. A frequent surprise is a TPOT regression that appears with no code change at all: users simply started having longer conversations.

```quiz
{"q": "Using $s_{kv} = 2 L h_{kv} d_h b_{kv}$, what is the KV-cache size per token for Llama 3 70B ($L = 80$, $h_{kv} = 8$, $d_h = 128$) in BF16?", "options": ["320 KiB", "160 KiB", "2.5 MiB", "640 KiB"], "answer": 0, "explain": "$2 \\times 80 \\times 8 \\times 128 \\times 2 = 327{,}680$ bytes $= 320$ KiB. Forgetting the factor 2 for keys and values gives 160 KiB; using 64 query heads instead of 8 KV heads gives 2.5 MiB."}
```

```quiz
{"q": "A 7B model in BF16 (14 GB of weights) decodes at 120 tokens/s for one user on a GPU with 2.0 TB/s of bandwidth. What is the MBU, ignoring KV reads?", "options": ["84%", "60%", "42%", "Under 1%"], "answer": 0, "explain": "$120 \\times 14 \\times 10^9 = 1.68 \\times 10^{12}$ B/s, and $1.68/2.0 = 0.84$. Using 7 GB (1 byte per weight) gives 42%; 'under 1%' is the MFU, which is meaningless for decode."}
```
