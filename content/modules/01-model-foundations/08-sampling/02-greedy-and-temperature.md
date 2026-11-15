---
title: Greedy decoding and temperature
minutes: 7
---

Once you have probabilities, the simplest policy is to always take the most likely token. That is **greedy decoding**, and for short factual answers it is often exactly right. For anything longer it has a well-known failure: the single most likely next token, chosen again and again, tends to produce bland, looping text ("I think that I think that ..."). Human writing is not a string of the most probable words; it contains surprises.

The opposite policy is to **sample**: draw a token at random in proportion to its probability. Sampling gives variety, but it also occasionally draws a token from the long, low-probability tail, and one bad token early on can derail everything after it. **Temperature** is the dial between these two extremes.

## In everyday life

Think of a music app choosing your next song. One way is to always play the song it thinks you like most. At first that feels right. After an hour the same few songs loop and the playlist goes dull. The opposite way is pure shuffle, which is lively but sometimes drops a song that clashes with the mood.

Now imagine a dial on the app, with "play it safe" at one end and "surprise me" at the other. Turn it towards safe and the favourite is picked almost every time. Turn it towards surprise and the lesser songs get a real chance. The dial changes how hard the app leans on its favourite. It never changes which song the app likes best.

A language model faces this choice for every token (a piece of a word). Always taking the most likely token is **greedy decoding**: steady, but repetitive on long text. Picking at random in proportion to the chances is **sampling**. The dial is **temperature**: low leans on the favourite, high flattens the chances. Unlike skipping a bad song, a bad pick here cannot be skipped, because the model carries on from it. And the dial cannot fix a favourite that is simply wrong.

**Where you meet it.** A bank's help chatbot that must quote the exact name of a form should sit near the safe end. A tool suggesting names for a new cafe should lean towards surprise. It is the same model with a different dial setting.

```scene
title: The song picker with a dial
step: 🎵 The app has a favourite next song and some less likely ones | probabilities over next tokens
step: 🔁 Always playing the favourite makes the same few songs loop | greedy decoding
step: 🎲 Pure shuffle brings variety but sometimes a clashing song | sampling from the full tail
step: 🔧 A dial sets how strongly the app leans on its favourite | temperature
step: 🔒 With the dial at safe, the favourite wins almost every time | temperature near zero
takeaway: Temperature reshapes the chances but never the ranking, so it cannot fix a favourite that is wrong.
```

## Greedy, written precisely

$$
x_{t+1} = \arg\max_{i} \; p_i = \arg\max_{i} \; z_i
$$

$x_{t+1}$ is the next token, and the $\arg\max$ returns the index of the largest value. Because softmax preserves order, the argmax of the probabilities is the argmax of the logits: greedy does not even need the softmax. It is deterministic: the same prompt gives the same output (up to tiny floating-point differences across hardware and batch sizes, which in practice can occasionally flip a near-tie).

## Temperature

Temperature $T > 0$ divides every logit before the softmax:

$$
p_i(T) = \frac{e^{z_i / T}}{\sum_{j} e^{z_j / T}}
$$

Dividing by $T$ scales every difference between logits by $1/T$, and probability ratios become $p_i/p_j = e^{(z_i - z_j)/T}$.

- $T = 1$ leaves the model's distribution untouched.
- $T < 1$ stretches the gaps: the favourite gets more probability, the tail gets less. As $T \to 0$ the distribution collapses onto the argmax, which is greedy. (APIs implement "temperature 0" as greedy, since you cannot divide by zero.)
- $T > 1$ shrinks the gaps: the distribution flattens towards uniform, and the tail gets more probability.

Temperature never changes the *order* of tokens, only how sharply the probability is concentrated.

## Worked example

Use the same four logits as before: $(2.0, 1.0, 0.5, -1.0)$ for " Paris", " the", " a", " Lyon".

| $T$ | scaled logits $z/T$ | $e^{z/T}$ | sum | probabilities |
|---|---|---|---|---|
| 0.5 | 4, 2, 1, −2 | 54.60, 7.39, 2.72, 0.135 | 64.84 | 0.842, 0.114, 0.042, 0.002 |
| 1.0 | 2, 1, 0.5, −1 | 7.39, 2.72, 1.65, 0.368 | 12.12 | 0.609, 0.224, 0.136, 0.030 |
| 2.0 | 1, 0.5, 0.25, −0.5 | 2.72, 1.65, 1.28, 0.607 | 6.26 | 0.434, 0.263, 0.205, 0.097 |

At $T = 0.5$, " Lyon" falls from 3% to 0.2%: a sampled answer will almost never be wrong in that way. At $T = 2$ it rises to almost 10%: one generation in ten would say Lyon. Check one ratio: at $T = 2$, $p_\text{Paris}/p_\text{the} = 0.434/0.263 = 1.65 = e^{(2-1)/2} = e^{0.5}$.

```callout-math
Why dividing by T is the natural dial
Softmax with temperature is the Boltzmann distribution from physics, $p_i \propto e^{-E_i / kT}$, with energy $E_i = -z_i$. Low temperature means the system sits in its lowest-energy state; high temperature means it visits many states. The name is borrowed from there.
```

## See it

```sim
sampling
{"temperature": 0.2, "topP": 1}
```

Start at temperature 0.2 and note that the top token holds nearly all the probability: sampling with any seed gives the same continuation, just like greedy. Raise temperature to 1, then 1.5, then 2. Watch the bars level out and the sampled continuation start to wander. Then find the temperature at which the second-ranked token first exceeds 25%.

## Choosing a temperature

| Task | Typical temperature | Why |
|---|---|---|
| Extraction, classification, SQL, JSON | 0 to 0.2 | One right answer; variety is just error |
| Chat, explanations | 0.5 to 0.8 | Natural phrasing without wandering |
| Brainstorming, fiction, many diverse samples | 0.9 to 1.2 | You want different outputs each time |

Above about 1.5 most models produce visibly degraded text, because the tail of a 50,000-token vocabulary is full of tokens that make no sense in context, and flattening gives them real probability mass.

## In practice

Two mistakes come up repeatedly. First, people set temperature 0 and expect bit-for-bit reproducibility across API calls; it is usually close but not guaranteed, because batched GPU arithmetic is not perfectly deterministic and near-ties can flip. If you need reproducibility, log the outputs rather than relying on regeneration. Second, people raise temperature to "make the model smarter" or lower it to "stop hallucinations". Temperature only reshapes the distribution the model already has: if the model's top answer is wrong, temperature 0 gives you that wrong answer every time, confidently.

```quiz
{"q": "Logits are (3, 1). At T = 1 the probabilities are about (0.88, 0.12). What is the probability of the first token at T = 2?", "options": ["About 0.73", "About 0.94", "0.5", "About 0.88, temperature only affects sampling"], "answer": 0, "explain": "At $T = 2$ the scaled logits are (1.5, 0.5), a gap of 1, so $p_1 = e^{1}/(e^{1} + 1) = 2.718/3.718 \\approx 0.73$. Higher temperature flattens. Choosing 0.94 moves the wrong way: sharpening happens only for $T < 1$ (at $T = 0.5$ the gap becomes 4 and $p_1 \\approx 0.98$)."}
```

```quiz
{"q": "A support bot at temperature 0 consistently gives the same wrong refund policy. What does lowering temperature further, or switching to greedy, do?", "options": ["Fixes it, because lower temperature reduces hallucination", "Nothing useful: greedy already returns the model's top choice, which is the wrong answer", "Makes it worse by adding randomness", "Makes it refuse to answer"], "answer": 1, "explain": "Temperature 0 is already greedy. The error is in the model's distribution (missing or wrong knowledge), so the fix is grounding the answer in the real policy document, not changing the sampler. Lower temperature cannot add knowledge."}
```
