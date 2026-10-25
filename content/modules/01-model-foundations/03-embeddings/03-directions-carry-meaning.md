---
title: Directions carry meaning
minutes: 7
---

On a map, the step from Paris to Berlin is an arrow: so far east, so far north. If you apply the same arrow starting from somewhere else you land in a place that is "east-north-east of there" by the same amount. Trained embeddings turned out to have arrows like this for meaning. The step from "man" to "woman" points in roughly the same direction as the step from "king" to "queen", or from "uncle" to "aunt".

This was the striking result of the word2vec work in 2013: relationships between words appear as consistent **offsets** (difference vectors) in embedding space, so simple vector arithmetic can complete analogies. Nobody programmed a "gender direction" or a "plural direction". They emerged because predicting surrounding words is easier when similar relationships are stored in similar ways.

## Analogy as vector arithmetic

To answer "man is to king as woman is to ?", compute a target vector and find the word whose embedding is closest to it by cosine similarity:

$$
\mathbf{t} = \mathbf{v}_{\text{king}} - \mathbf{v}_{\text{man}} + \mathbf{v}_{\text{woman}}, \qquad \hat{w} = \arg\max_{w \notin \{\text{king, man, woman}\}} \cos(\mathbf{t}, \mathbf{v}_w)
$$

Here $\mathbf{v}_w$ is the embedding of word $w$ and $\arg\max$ means "the $w$ that makes the expression largest". The input words are excluded because $\mathbf{t}$ is often closest to $\mathbf{v}_\text{king}$ itself; this detail is routinely left out of popular explanations and makes the trick look cleaner than it is.

The logic: $\mathbf{v}_{\text{king}} - \mathbf{v}_{\text{man}}$ removes "maleness" and keeps "royalty"; adding $\mathbf{v}_{\text{woman}}$ puts "femaleness" back in.

```steps
King − man + woman, by hand
Toy 3-D embeddings, with axes you can read as roughly (royal, male, female): king $= (0.9, 0.8, 0.1)$, man $= (0.1, 0.8, 0.1)$, woman $= (0.1, 0.1, 0.8)$.
---
Subtract: king − man $= (0.8, 0.0, 0.0)$. Only the royal part is left.
---
Add woman: $\mathbf{t} = (0.8 + 0.1,\ 0.0 + 0.1,\ 0.0 + 0.8) = (0.9, 0.1, 0.8)$.
---
Compare with candidates. queen $= (0.8, 0.15, 0.85)$: dot $= 0.72 + 0.015 + 0.68 = 1.415$, norms $\approx 1.208$ and $\approx 1.177$, cosine $\approx 0.995$. prince $= (0.85, 0.75, 0.3)$ scores $\approx 0.762$. Queen wins clearly.
```

In real models the axes are not readable like this. A single coordinate rarely means anything on its own; meaning lives in *directions*, which are mixtures of many coordinates. The toy axes are a teaching device.

## See it

```sim
embedding-space
```

Use the analogy tool: enter king − man + woman and see which word is nearest to the result. Then try a relation that is less tidy (a country and its capital, or a verb and its past tense) and look at how far the nearest neighbour is. Some analogies land almost exactly; many land in the right neighbourhood with a wrong word nearest.

## Why it works, and where it breaks

A model trained to predict context words is pushed to give words with similar contexts similar vectors. "King" and "queen" share most contexts (crowns, thrones, reigns) and differ in the same way "man" and "woman" differ (pronouns, titles). If every gendered pair differs by roughly the same contexts, the cheapest way to encode that is a shared offset.

| What holds up | What does not |
|---|---|
| Frequent, regular relations (gender pairs, plurals, verb tenses, some country–capital pairs) | Rare words, whose vectors are noisy |
| Nearest-neighbour search in the right region | Exact equality: $\mathbf{t}$ almost never *equals* the answer |
| Directions as a probe of what a model encodes | Treating offsets as a reliable reasoning engine |

The same geometry also carries the patterns of the text it was trained on, including social stereotypes. Studies of word embeddings found occupation words lined up along the gender direction in ways that reflected bias in the training corpus. Anything you build on embeddings inherits those directions unless you measure and correct for them.

## In practice

Analogy arithmetic is rarely used directly in production. What engineers rely on is the property underneath it: **semantic similarity is geometric closeness**. That is what makes nearest-neighbour search over embeddings (the basis of retrieval-augmented generation, deduplication and clustering) work. The same idea, that a concept corresponds to a direction, is used in interpretability research to find and steer features inside large models.

```quiz
{"q": "With toy vectors $\\mathbf{v}_\\text{Paris} = (1, 0, 2)$, $\\mathbf{v}_\\text{France} = (0, 0, 2)$, $\\mathbf{v}_\\text{Italy} = (0, 1, 2)$, what is $\\mathbf{v}_\\text{Paris} - \\mathbf{v}_\\text{France} + \\mathbf{v}_\\text{Italy}$, and what should be nearest to it?", "options": ["$(1, 1, 2)$, ideally Rome", "$(1, 1, 6)$, ideally Europe", "$(1, -1, 2)$, ideally Paris", "$(0, 1, 0)$, ideally Italy"], "answer": 0, "explain": "Componentwise: $(1-0+0,\\ 0-0+1,\\ 2-2+2) = (1, 1, 2)$. Paris − France isolates 'capital of', and adding Italy asks for the capital of Italy. Adding all three vectors gives $(1,1,6)$, which is the common slip of using + everywhere."}
```

```quiz
{"q": "Why do analogy benchmarks exclude the three input words when searching for the nearest neighbour of king − man + woman?", "options": ["Because the result vector is often closest to one of the inputs, usually king, which would make the test meaningless", "Because input words have no embeddings", "Because cosine similarity is undefined for input words", "Because excluding them makes the arithmetic exact"], "answer": 0, "explain": "The offset man → woman is small compared with the king vector, so $\\mathbf{t}$ frequently stays nearest to king. Excluding inputs is part of the standard evaluation, and it means the analogy is a nearest-neighbour approximation, not exact arithmetic."}
```
