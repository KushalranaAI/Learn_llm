---
title: Did it work?
minutes: 9
---

A falling eval loss shows that the model assigns higher probability to the reference SQL. It doesn't show that the queries it writes are correct, that the tuning beat the plain base model with a prompt, or that the model can still do anything else. Three checks answer those questions. Score the outputs on held-out data, compare against the base model on exactly the same inputs, and probe for **catastrophic forgetting** with a few general prompts.

Use the dataset's own `test` split, which the trainer has never seen, and generate with greedy decoding so the comparison isn't blurred by sampling noise.

## In everyday life

A driving school teaches a learner reverse parking. After the course, how do you know it worked? You do not ask the learner to repeat the exact spaces practised. You use fresh bays, you check that the car really ends up inside the lines, and you compare with how the same learner did before the course. You also take the learner on an ordinary road to make sure nothing else got worse.

Checking a tuned model takes the same three steps. First, score its answers on the **held-out test set**, examples it never trained on, and judge by what an answer does, not how it looks. For database queries, two differently written queries can both be right, so you run them and compare the rows they return. That is **execution accuracy**. Second, run the original model on exactly the same inputs, so any gain is real and not luck. A score from a small test has a margin of error, so read it as a range. Third, ask ordinary questions to catch **catastrophic forgetting**, where a model gets so good at the new task that it loses other skills.

The picture stops at one point: a learner who forgot would need weeks to recover, but a model with the add-on switched off returns to the original at once.

**Where you meet it.** A company tunes a model to write database queries and sees eval loss fall. Before shipping, it runs each query on a test database, compares against the base model, and tries a few general questions. If the tuned model answers a question about the capital of Japan with a database query, it knows it has gone too far.

```scene
title: Testing a reverse-parking course
step: 🚗 A learner finishes a reverse-parking course | tuned model
step: 🅿 The test uses fresh bays never practised | held-out test split
step: 📏 A pass means the car ends inside the lines, however it got there | execution accuracy
step: 📊 The same learner is tested before and after, on the same bays | base versus tuned, same inputs
step: 🔢 A short test gives a rough result, so quote a range | standard error and interval
step: 🛣 A normal drive checks that old skills are intact | forgetting probes
takeaway: Judge a tuned model on unseen data, against the original, and check that it has not forgotten everything else.
```

## Three scores, from cheap to strict

For text-to-SQL there are three useful metrics, each stricter than the last:

- **Format accuracy**: the output is a single SQL statement with no prose, no Markdown fence, and no second query. It's a [programmatic check](/learn/evaluation/reference-scoring/programmatic-checks), and it's the behaviour SFT changes most.
- **Exact match** after normalising case and whitespace ([Exact match](/learn/evaluation/reference-scoring/exact-match)). It is too strict for SQL: `COUNT(*)` and `COUNT(id)` can both be right.
- **Execution accuracy**: run the predicted and reference queries against the row's schema and data, then compare the result sets. Our dataset's `sql_context` contains the `CREATE TABLE` and `INSERT` statements, so Python's built-in `sqlite3` can do this in memory.

For open-ended outputs with no reference answer to execute, you would use an [LLM judge](/learn/evaluation/llm-as-judge/judge-basics) instead.

Each score is a proportion $\hat{p}$ over $n$ test rows, so it carries a standard error

$$\text{SE} = \sqrt{\frac{\hat{p}(1-\hat{p})}{n}}.$$

**Worked example.** On $n = 200$ test rows, suppose the base model scores 47% execution accuracy and the tuned model 74%. For the tuned model, $\text{SE} = \sqrt{0.74 \times 0.26 / 200} = 0.031$, so the 95% interval is $74\% \pm 6.1$ points. Both models answered the same rows, so you can count the rows where they disagree. Say tuning fixed 62 rows and broke 8. The net gain is $(62 - 8)/200 = 27$ points, which matches $74 - 47$. With 70 discordant rows split 62 to 8, the gain is far outside chance. [Paired comparisons](/learn/evaluation/comparing-systems/paired-comparisons) shows how to test it properly.

## The evaluation script

```python
import re, sqlite3, torch
from datasets import load_dataset
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

SYSTEM = "Write one SQLite query that answers the question. Output only SQL."
gpu = torch.cuda.is_available()
MODEL = "Qwen/Qwen2.5-1.5B-Instruct" if gpu else "Qwen/Qwen2.5-0.5B-Instruct"
tok = AutoTokenizer.from_pretrained(MODEL)
base = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.float16 if gpu else torch.float32,
                                            device_map="auto" if gpu else None)
model = PeftModel.from_pretrained(base, "qwen-sql-lora/final").eval()

test = load_dataset("gretelai/synthetic_text_to_sql", split="test").shuffle(seed=1).select(range(200))

def generate(msgs, max_new_tokens=200):
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=max_new_tokens, do_sample=False)
    return tok.decode(out[0, ids["input_ids"].shape[1]:], skip_special_tokens=True).strip()

def run(context, sql):
    db = sqlite3.connect(":memory:")
    try:
        db.executescript(context)
        return sorted(map(repr, db.execute(sql).fetchall()))
    except Exception:
        return None                                   # did not parse or run
    finally:
        db.close()

is_format = lambda s: bool(re.match(r"(?is)^\s*(select|with|insert|update|delete)\b", s)) \
    and "`" * 3 not in s and s.rstrip().rstrip(";").count(";") == 0
norm = lambda s: " ".join(s.lower().rstrip(";").split())

def score(use_adapter):
    fmt = em = ex = 0
    for r in test:
        msgs = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": f"Schema:\n{r['sql_context'].strip()}\n\nQuestion: {r['sql_prompt'].strip()}"}]
        if use_adapter:
            pred = generate(msgs)
        else:
            with model.disable_adapter():             # same weights, adapter switched off
                pred = generate(msgs)
        gold_rows = run(r["sql_context"], r["sql"])
        fmt += is_format(pred); em += norm(pred) == norm(r["sql"])
        ex += gold_rows is not None and run(r["sql_context"], pred) == gold_rows
    n = len(test)
    return {"format": fmt / n, "exact": em / n, "execution": ex / n}

print("base ", score(False))
print("tuned", score(True))
```

`disable_adapter()` lets you score the base and the tuned model from one copy of the weights, which halves memory. Some reference queries in a synthetic dataset don't run at all. The script counts those rows as failures for both models, so they lower both scores without changing the gap.

## Checking for forgetting

SFT on 2,000 SQL rows pushes the model toward SQL everywhere. LoRA forgets less than full fine-tuning (Biderman et al., 2024, measured this) but still forgets some. Send ten everyday prompts with the model's default system prompt, generate with the adapter on and off, and read the two sets of answers side by side. [What SFT cannot fix](/learn/fine-tuning/instruction-tuning/limits-of-sft) covers the theory.

```python
probes = ["What is the capital of Japan?", "Write a haiku about rain.", "Explain recursion to a child.",
          "Translate 'good morning' into Spanish.", "What is 17 times 23?"]
for p in probes:
    msgs = [{"role": "user", "content": p}]
    with model.disable_adapter():
        before = generate(msgs, 80)
    print(f"Q: {p}\n  base : {before[:120]}\n  tuned: {generate(msgs, 80)[:120]}\n")
```

| Symptom on general prompts | Diagnosis | Fix |
|---|---|---|
| Answers become `SELECT ...` | Behaviour leaked beyond the task | Mix in 10–20% general chat rows, e.g. from `trl-lib/Capybara` |
| Answers are right but terser | Mild style drift | Usually acceptable for a task adapter |
| Answers unchanged | Little forgetting | Ship it, and load the adapter only for SQL requests |

## In practice

- Always report the base model with your best prompt next to the tuned model. If a few-shot prompt already reaches 70%, a tuned 74% may not justify a training pipeline. [When fine-tuning pays](/learn/fine-tuning/start-here/when-fine-tuning-pays) has the break-even calculation.
- Read 20 of the failures by hand before you change any hyperparameter ([Read the failures](/learn/evaluation/error-analysis/read-the-failures)). Wrong column names point to a data problem. Truncated queries point to a `max_new_tokens` or length problem.
- Hold the test set fixed across every run you compare. Otherwise the gaps between runs mean nothing.

```quiz
{"q": "On 400 test rows the tuned model scores 0.80. What is the approximate 95% interval?", "options": ["$\\pm 3.9$ points", "$\\pm 2.0$ points", "$\\pm 8.0$ points", "$\\pm 0.4$ points"], "answer": 0, "explain": "$\\text{SE} = \\sqrt{0.8 \\times 0.2 / 400} = 0.02$, and $1.96 \\times 0.02 \\approx 0.039$, about 3.9 points. 2.0 points is one standard error, not the 95% interval."}
```

```quiz
{"q": "Why is execution accuracy a better headline metric than exact match for text-to-SQL?", "options": ["Different but equivalent queries return the same rows, so execution credits them while exact match marks them wrong", "Execution is cheaper to compute", "Exact match cannot be computed for SQL", "Execution accuracy is always higher, so it looks better"], "answer": 0, "explain": "`COUNT(*)` and `COUNT(id)`, or reordered conditions, are both correct but differ as strings. Execution compares results, which is what the user cares about. It is not cheaper, since it runs two queries per row, and choosing a metric because it looks higher is the wrong reason."}
```
