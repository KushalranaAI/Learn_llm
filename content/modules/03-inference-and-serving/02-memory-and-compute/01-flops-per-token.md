---
title: Counting the arithmetic, about 2N FLOPs per token
minutes: 7
---

```callout-before
Before you start
A **FLOP** here means one floating-point operation: one multiply or one add. Throughput of hardware is quoted in FLOP/s; TFLOP/s means $10^{12}$ per second. You need nothing else beyond matrix-vector multiplication.
```

Before asking why inference is slow, ask how much arithmetic it actually needs. The answer is surprisingly simple, and surprisingly small compared with what a modern GPU can do. That mismatch is the starting point of the whole lesson: if the arithmetic were the bottleneck, LLMs would be dozens of times faster than they are.

Almost all the work in a transformer is matrix multiplication: the attention projections ($W_Q, W_K, W_V, W_O$), the two or three MLP matrices in every block, and the final unembedding. Count the cost of one matrix-vector product and you can count the whole model.

## One matrix, one token

Take a weight matrix $W$ with $m$ rows and $k$ columns, and one token's activation vector $\mathbf{x}$ of length $k$. Each output $y_i = \sum_{j=1}^{k} W_{ij} x_j$ needs $k$ multiplies and $k - 1$ adds, call it $2k$ FLOPs. There are $m$ outputs, so

$$
\text{FLOPs}(W\mathbf{x}) \approx 2mk = 2 \times (\text{number of parameters in } W)
$$

Every weight is used exactly once per token: multiplied by one input and added into one output. Summing over all the matrices of a model with $N$ parameters gives the rule engineers use constantly:

$$
\text{FLOPs per token (forward)} \approx 2N
$$

The embedding lookup at the input is a table read, not a multiplication, so strictly the input embedding should be excluded from $N$; for a 7B+ model it changes the estimate by a few percent at most.

```steps
2N for an 8B model
Take a model with $N \approx 8.0 \times 10^{9}$ parameters, about the size of Llama 3 8B.
---
Per token: $2N = 2 \times 8.0 \times 10^{9} = 1.6 \times 10^{10}$ FLOPs, or 16 GFLOP.
---
A million output tokens: $1.6 \times 10^{10} \times 10^{6} = 1.6 \times 10^{16}$ FLOPs.
---
An H100 SXM offers approximately 989 TFLOP/s of dense BF16 compute. At that peak, a million tokens would take $1.6\times10^{16} / 9.89\times10^{14} \approx 16$ seconds.
---
Generating one token at a time for one user, the same million tokens take over an hour in practice. Something other than arithmetic is setting the pace. The next topic shows what.
```

## The attention term

$2N$ counts the weight matrices. Attention also multiplies the new token's query against every cached key and then weights every cached value. These products involve activations, not parameters, so $2N$ misses them. For a context of $n$ tokens, model width $d$ and $L$ layers, the query-key scores cost about $2nd$ FLOPs per layer and the weighted sum of values another $2nd$:

$$
\text{FLOPs per token} \approx 2N + 4 L n d
$$

Here $d = h \cdot d_h$ (all query heads combined). Grouped-query attention shrinks the KV cache but not this count, because every query head still attends over every position.

For an 8B model with $L = 32$ and $d = 4096$ at a context of $n = 8192$: $4 \times 32 \times 8192 \times 4096 \approx 4.3 \times 10^{9}$ FLOPs, about 27% on top of the 16 GFLOP. At $n = 1000$ it is about $0.5 \times 10^{9}$, only 3%. For classic architectures where $N \approx 12 L d^2$, the ratio simplifies to

$$
\frac{4Lnd}{2N} \approx \frac{4Lnd}{24 L d^2} = \frac{n}{6d}
$$

so attention FLOPs rival the weight FLOPs only when the context approaches $6d$ tokens (about 25k for $d = 4096$).

| Context $n$ | Weight FLOPs $2N$ | Attention $4Lnd$ | Total per token |
|---|---|---|---|
| 1,000 | 16.0 G | 0.5 G | 16.5 G |
| 8,192 | 16.0 G | 4.3 G | 20.3 G |
| 32,768 | 16.0 G | 17.2 G | 33.2 G |

(8B model, $L = 32$, $d = 4096$.)

## Prompts cost the same per token

Prefill processes $n_{in}$ prompt tokens, each costing about $2N$, so a prompt costs about $2 N n_{in}$ FLOPs in total (plus attention, which grows roughly with $n_{in}^2$ during prefill). A 2,000-token prompt to the 8B model is about $3.2 \times 10^{13}$ FLOPs. Per token, prompt and output cost the same arithmetic. The difference in *time* comes entirely from how that arithmetic is fed with data, which is the subject of the rest of this lesson.

For comparison, training costs about $6N$ per token (forward $2N$ plus a backward pass of about $4N$); that is covered in the training module.

## In practice

Use $2N$ for quick estimates of prefill time, the compute needed for an offline batch job, or the floor on cost. A common mistake is to divide $2N \times$ tokens by the GPU's peak FLOP/s and call that the latency: it gives the 16-second answer above, which is wrong by a factor of hundreds for single-user decode. FLOPs set a lower bound on time; for decode, memory traffic sets a much higher one.

```quiz
{"q": "Roughly how many FLOPs does a 70B-parameter model need per generated token, ignoring attention?", "options": ["$1.4 \\times 10^{11}$", "$7 \\times 10^{10}$", "$4.2 \\times 10^{11}$", "$1.4 \\times 10^{10}$"], "answer": 0, "explain": "$2N = 2 \\times 7 \\times 10^{10} = 1.4 \\times 10^{11}$, i.e. 140 GFLOP. $7\\times10^{10}$ forgets the factor 2 (multiply and add); $4.2 \\times 10^{11}$ is the training cost $6N$."}
```

```quiz
{"q": "A model has $d = 4096$. At roughly what context length do attention FLOPs per token equal the weight FLOPs, using the $n/(6d)$ rule?", "options": ["About 24,600 tokens", "About 4,096 tokens", "About 683 tokens", "About 98,000 tokens"], "answer": 0, "explain": "Setting $n/(6d) = 1$ gives $n = 6d = 24{,}576$. 4,096 is $d$ itself (forgets the 6); 683 is $d/6$, the formula inverted."}
```
