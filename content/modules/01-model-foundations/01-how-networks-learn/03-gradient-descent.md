---
title: Gradient descent, walking downhill
minutes: 8
---

Imagine standing on a hillside in thick fog. You cannot see the valley, but you can feel the slope under your feet. A reliable way down: feel which direction is steepest downhill, take a step that way, repeat. You will not know you have reached the bottom until the ground feels flat.

That is **gradient descent**. The "landscape" is the loss as a function of the parameters: every possible setting of the weights is a point, and the height at that point is the loss. Training starts at a random point and keeps stepping downhill. The fog is real: with millions of parameters nobody can draw the landscape, but we can always compute the local slope.

## One parameter: the slope tells you which way

Take the simplest possible loss, a function of one weight $w$:

$$
L(w) = (w - 3)^2
$$

Its minimum is obviously at $w = 3$, but pretend we do not know that. The **derivative** $\frac{dL}{dw}$ is the slope at the current point: positive means the loss rises as $w$ grows, so we should decrease $w$; negative means the opposite. Here $\frac{dL}{dw} = 2(w - 3)$. The update rule moves against the slope:

$$
w_{\text{new}} = w - \eta \, \frac{dL}{dw}
$$

$\eta$ (eta) is the **learning rate**, a small positive number that sets the step size. The minus sign is the whole trick: always step opposite to the slope.

```steps
Three steps of gradient descent, by hand
Start at $w = 0$ with $\eta = 0.1$. Loss $L = (0 - 3)^2 = 9$. Slope $2(0 - 3) = -6$.
---
Update: $w = 0 - 0.1 \times (-6) = 0.6$. Loss $(0.6 - 3)^2 = 5.76$.
---
Slope $2(0.6 - 3) = -4.8$. Update: $w = 0.6 + 0.48 = 1.08$. Loss $(1.08-3)^2 = 3.69$.
---
Slope $-3.84$, so $w = 1.464$, then $1.771$, then $2.017$. Each step closes 20% of the remaining gap, because $w - 3$ is multiplied by $1 - 2\eta = 0.8$ every step. After 10 steps the gap is $3 \times 0.8^{10} \approx 0.32$; after 20 steps, $\approx 0.035$.
```

Notice that the steps shrink by themselves. Near the minimum the slope is small, so $\eta \cdot$ slope is small. Nobody has to tell the algorithm to slow down.

## Many parameters: the gradient

A real network has a loss that depends on every parameter at once, $L(w_1, w_2, \dots, w_P)$. The **partial derivative** $\frac{\partial L}{\partial w_j}$ is the slope along one parameter while holding the others fixed. Stack them all into a vector and you get the **gradient**:

$$
\nabla L = \left( \frac{\partial L}{\partial w_1}, \frac{\partial L}{\partial w_2}, \dots, \frac{\partial L}{\partial w_P} \right), \qquad \mathbf{w}_{\text{new}} = \mathbf{w} - \eta \, \nabla L
$$

The gradient points in the direction of steepest *increase*, so subtracting it is the steepest way down. Every parameter moves at once, each by an amount proportional to how much it affects the loss.

## A worked example on a real neuron

A one-input linear neuron predicts $\hat y = w x + b$. Training example: $x = 2$, target $y = 7$. Start at $w = 1$, $b = 0$, and use the squared error $L = (\hat y - y)^2$.

- Forward: $\hat y = 1 \cdot 2 + 0 = 2$, so $L = (2 - 7)^2 = 25$.
- Gradients (chain rule, derived properly two topics from now): $\frac{\partial L}{\partial w} = 2(\hat y - y)\,x = 2(-5)(2) = -20$ and $\frac{\partial L}{\partial b} = 2(\hat y - y) = -10$.
- Update with $\eta = 0.01$: $w = 1 - 0.01(-20) = 1.2$ and $b = 0 - 0.01(-10) = 0.1$.
- Check: $\hat y = 1.2 \cdot 2 + 0.1 = 2.5$, so $L = (2.5 - 7)^2 = 20.25$. Down from 25.

The weight moved twice as far as the bias because its gradient was twice as big: it is multiplied by the input $x = 2$. Inputs with larger values produce larger weight gradients, which is one reason engineers normalise inputs.

## See it

The sim draws a two-parameter loss surface as contour lines and animates each step. The **round bowl** is $L(x, y) = \tfrac12 (x^2 + y^2)$, whose gradient is simply $(x, y)$.

```sim
gradient-descent
{"surface": "bowl", "lr": 0.1, "steps": 40, "startX": -2.2, "startY": 1.5}
```

With $\eta = 0.1$ each step multiplies both coordinates by $1 - 0.1 = 0.9$, so the path is a straight line to the centre. Now switch the surface to **Narrow ravine**, $\tfrac12(x^2 + 10y^2)$. The slope is ten times steeper across the ravine than along it, so the path cuts across first and then crawls along the floor. Finally try **Two valleys** and move the start point from $x = -2$ to $x = +2$: gradient descent finds whichever valley is downhill from where it starts. It is a local method; it never sees the whole map.

## In practice

- **Nobody uses plain gradient descent on the full dataset.** Computing the exact gradient over billions of tokens for each step is far too slow. Training uses a small random **mini-batch** per step (the epochs topic covers this), which gives a noisy but cheap estimate of the gradient.
- **Real optimisers add memory.** **Momentum** keeps a running average of past gradients so that consistent directions speed up and zig-zags cancel; try the momentum slider in the ravine. **Adam**, the default for training LLMs, also scales each parameter's step by a running estimate of its gradient size. Both are still "step against the gradient" at heart.
- **Local minima are less of a worry than people expect.** In very high dimensions most flat points are saddle points that a noisy optimiser slides off, and large networks have many equally good solutions. The bigger practical worries are the learning rate (next topic) and overfitting.

```quiz
{"q": "At the current weights, $\\partial L/\\partial w = 4$ and $\\eta = 0.05$. What does one gradient descent step do to $w$?", "options": ["Increases it by 0.2", "Decreases it by 0.2", "Decreases it by 4", "Sets it to 0.2"], "answer": 1, "explain": "$w_{new} = w - \\eta \\cdot 4 = w - 0.2$. A positive slope means the loss rises as $w$ rises, so we step down. Adding 0.2 would climb the hill; subtracting 4 forgets the learning rate."}
```

```quiz
{"q": "For $L(w) = (w-3)^2$ starting at $w = 0$ with $\\eta = 0.25$, where is $w$ after one step?", "options": ["0.75", "1.5", "3.0", "6.0"], "answer": 1, "explain": "The slope at 0 is $2(0-3) = -6$, so $w = 0 - 0.25 \\times (-6) = 1.5$. Equivalently the gap to 3 is multiplied by $1 - 2\\eta = 0.5$, halving it from 3 to 1.5. 3.0 is what $\\eta = 0.5$ would give."}
```
