// Lab: a bank's support chat. Tokens are the unit of cost; work out the bill, then trim it without gutting the product.
import type { Lab } from "./types";

const r = String.raw;

export const tokenBudget: Lab = {
  slug: "token-budget",
  module: "model-foundations",
  title: "The token budget",
  product: "A bank's support chat",
  summary: "A bank's support chat costs more than finance expected. Learn how text becomes tokens, compute the monthly bill by hand, and trim the system prompt and answer length to get under budget.",
  difficulty: "easy",
  minutes: 20,
  tags: ["tokenization", "BPE", "token cost", "pricing", "multilingual"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A bank has put an AI assistant in its mobile app. Customers ask about card limits, transfers and fees. The bill for the first month arrived and finance wants to know why.

Language models never see words. A **tokenizer** splits text into pieces (**tokens**): common words are one token, rare words several, and punctuation, numbers and code usually cost more than you expect. APIs bill **per token**, and output tokens cost several times more than input tokens.

The assistant's numbers, per chat turn:

- a fixed **system prompt** of 1,200 tokens (rules, tone, compliance text) sent with every request,
- the customer's message, about 150 words,
- an answer of about 120 words,
- 40,000 turns a day,
- prices of \$3 per million input tokens and \$15 per million output tokens.

Your job: understand where the tokens come from, compute the bill, and bring it under \$5,000 a month without breaking the product.`,
    },
    {
      type: "quiz",
      title: "Words are not tokens",
      body: r`A GPT-style tokenizer averages about 1.3 tokens per English word, but that ratio changes a lot with the text.`,
      question: "Which statement about tokens and cost is correct?",
      options: [
        { text: "The same sentence usually costs more tokens in Hindi than in English, and JSON or code costs more per word than prose", correct: true, why: "Right. Tokenizers are trained mostly on English text, so other scripts split into more pieces, and symbols, braces and indentation in code and JSON are token-hungry." },
        { text: "Cost depends on the number of characters, so a short word in any language costs the same", why: "Billing is per token, not per character. A long common word can be one token while a short rare string can be four." },
        { text: "Input and output tokens cost the same, so only total length matters", why: "Output tokens are generated one at a time and usually cost 3-5 times more than input tokens. Both lengths matter, in different proportions." },
        { text: "Whitespace and punctuation are free because they are not words", why: "Punctuation and whitespace are tokens too (often merged with a neighbour). They are not free." },
      ],
    },
    {
      type: "sim",
      title: "Watch a tokenizer learn",
      body: r`**Byte-pair encoding** (BPE) builds a vocabulary by repeatedly merging the most frequent adjacent pair of symbols. Start from single characters (116 tokens for this text) and add merges.

Find a number of merges that compresses the text to at least 2.5 characters per token while keeping the vocabulary small (at most 40 symbols). Notice what happens when you ask for more merges than the text can support.`,
      sim: "bpe-tokenizer",
      params: { merges: 0 },
      locked: ["text", "pretokenize"],
      goals: [
        { metric: "charsPerToken", op: ">=", value: 2.5, label: "At least 2.5 characters per token" },
        { metric: "vocabSize", op: "<=", value: 40, label: "Vocabulary of at most 40 symbols" },
      ],
      hints: [
        "Each merge adds one symbol to the vocabulary and shortens the text a little.",
        "Compression climbs quickly at first, then flattens: the early merges are the most frequent pairs.",
        "Around 20 merges is enough on this short text. Training stops early when no pair repeats.",
      ],
      solution: { merges: 20 },
    },
    {
      type: "math",
      title: "The monthly bill",
      body: r`Each turn sends the system prompt plus the customer's message, and receives an answer. English text averages **1.3 tokens per word**.

- Input tokens per turn: $1200 + 150 \times 1.3$
- Output tokens per turn: $120 \times 1.3$
- Prices: \$3 per 1M input tokens, \$15 per 1M output tokens
- 40,000 turns per day, 30 days per month`,
      question: r`What is the monthly cost in dollars?`,
      answer: 7830,
      tolerance: 0.01,
      unit: "USD / month",
      hint: r`Cost per turn $= (\text{input tokens}\times 3 + \text{output tokens}\times 15)/10^6$. Then multiply by $40000\times 30$.`,
      solution: r`**Tokens per turn.**

$$\text{input} = 1200 + 150\times 1.3 = 1395, \qquad \text{output} = 120\times 1.3 = 156$$

**Cost per turn.**

$$\frac{1395\times 3 + 156\times 15}{10^6} = \frac{4185 + 2340}{10^6} = \$0.006525$$

**Per month.**

$$0.006525 \times 40{,}000 \times 30 = \$7{,}830$$

Output is only 156 tokens but costs \$2,340 of the \$6,525 per thousand turns: 36% of the bill from 10% of the tokens. The system prompt alone, repeated on every turn, is the biggest input item.`,
    },
    {
      type: "sim",
      title: "Trim the bill, keep the product",
      body: r`Trim the bill under **\$5,000 a month** by changing only the system prompt length and the answer length. Do not gut the product: answers must stay useful (at least 100 output tokens) and the prompt must still carry its rules (at least 700 input tokens in total).`,
      sim: "token-cost",
      params: { systemTokens: 1200, inputWords: 150, outputWords: 120, language: "english", inputPrice: 3, outputPrice: 15, requestsPerDay: 40000 },
      locked: ["inputWords", "language", "inputPrice", "outputPrice", "requestsPerDay"],
      goals: [
        { metric: "costPerMonth", op: "<=", value: 5000, label: "Monthly cost at most \$5,000" },
        { metric: "outputTokens", op: ">=", value: 100, label: "Answers keep at least 100 tokens" },
        { metric: "inputTokens", op: ">=", value: 700, label: "Input keeps at least 700 tokens" },
      ],
      hints: [
        "Look at the stacked bar: which part of the cost is the system prompt, and which is the answer?",
        "Cutting the answer from 120 to about 80 words saves a lot, because output tokens cost five times more.",
        "Shrink the system prompt to about 600 tokens and the answer to about 80 words.",
      ],
      solution: { systemTokens: 600, outputWords: 80 },
    },
    {
      type: "quiz",
      title: "A Hindi-language bank",
      body: r`The bank launches in India. Customers write in Hindi (Devanagari script). The tokenizer needs about **2.6 tokens per word** for Hindi, against 1.3 for English. Assume the system prompt stays in English and has the same 1,200 tokens, and word counts are unchanged.`,
      question: "Roughly how does the monthly bill change if every chat is in Hindi?",
      options: [
        { text: "About 45% higher: the customer text and the answer double in tokens, the system prompt does not", correct: true, why: "Input becomes $1200 + 150\\times 2.6 = 1590$ tokens (up 14%), output $120\\times 2.6 = 312$ tokens (up 100%). The bill goes from \\$7,830 to \\$11,340, about 45% more, and most of the increase comes from the doubled output." },
        { text: "Unchanged, because the number of words is the same", why: "Cost follows tokens, and tokens per word depends on the language." },
        { text: "Exactly double, because Hindi uses twice as many tokens", why: "Only the Hindi parts double. The English system prompt (1,200 of the 1,590 input tokens) does not change, so the total rises by less than 2x." },
        { text: "Lower, because Hindi sentences are shorter", why: "Word counts are fixed in this question, and Hindi text tokenizes into more pieces per word, not fewer." },
      ],
    },
  ],
};
