"""Checks the course content for broken references. Run from the repo root: python -I scripts/check-content.py

- every /learn/... link in markdown, lesson.json prerequisites and glossary `lesson` fields points at a real module/lesson/topic
- every ```sim, ```lab and ```sandbox id exists in the registries (parsed from source)
- every lesson.json sims/labs/sandbox id exists
- every interview section's lesson exists; glossary slugs are unique
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
problems: list[str] = []


def slug(name: str) -> str:
    return re.sub(r"^\d+-", "", name)


# modules / lessons / topics on disk
tree: dict[str, dict[str, set[str]]] = {}
for m in sorted((CONTENT / "modules").glob("*")):
    if not m.is_dir():
        continue
    lessons = {}
    for l in sorted(m.glob("*")):
        if l.is_dir():
            lessons[slug(l.name)] = {slug(t.stem) for t in l.glob("*.md")}
    tree[slug(m.name)] = lessons

# ids from source
def ids_in(folder: str, pattern: str) -> set[str]:
    out: set[str] = set()
    for f in (ROOT / folder).rglob("*.ts*"):
        if f.name.endswith(".test.ts") or f.name.startswith("_"):
            continue
        out |= set(re.findall(pattern, f.read_text(encoding="utf-8"), re.M))
    return out


sims = ids_in("sims", r'^\s*id:\s*"([a-z0-9-]+)"')
labs = set()
for f in (ROOT / "labs").glob("*.ts"):
    if f.name in ("types.ts", "index.ts") or f.name.endswith(".test.ts") or f.name.startswith("_"):
        continue
    labs |= set(re.findall(r'^\s*slug:\s*"([a-z0-9-]+)"', f.read_text(encoding="utf-8"), re.M))
scen = set(re.findall(r'^\s*id:\s*"([a-z0-9-]+)"', (ROOT / "sandbox" / "scenarios.ts").read_text(encoding="utf-8"), re.M))


def check_learn_path(p: str, where: str):
    parts = [x for x in p.split("#")[0].split("?")[0].strip("/").split("/") if x][1:]  # drop "learn"
    if not parts:
        return
    m = tree.get(parts[0])
    if m is None:
        problems.append(f"{where}: unknown module in /learn/{'/'.join(parts)}")
    elif len(parts) > 1 and parts[1] not in m:
        problems.append(f"{where}: unknown lesson in /learn/{'/'.join(parts)}")
    elif len(parts) > 2 and parts[2] not in m[parts[1]]:
        problems.append(f"{where}: unknown topic in /learn/{'/'.join(parts)}")


for md in (CONTENT / "modules").rglob("*.md"):
    text = md.read_text(encoding="utf-8")
    rel = md.relative_to(CONTENT)
    for href in re.findall(r"\]\((/learn[^)\s]*)\)", text):
        check_learn_path(href, str(rel))
    for kind, reg in (("sim", sims), ("lab", labs), ("sandbox", scen)):
        for block in re.findall(rf"```{kind}\s*\n(.*?)```", text, re.S):
            first = block.strip().split("\n")[0].strip()
            if first not in reg:
                problems.append(f"{rel}: ```{kind} id '{first}' not found")

for lj in (CONTENT / "modules").rglob("lesson.json"):
    data = json.loads(lj.read_text(encoding="utf-8"))
    rel = lj.relative_to(CONTENT)
    for key, reg in (("sims", sims), ("labs", labs), ("sandbox", scen)):
        for i in data.get(key, []):
            if i not in reg:
                problems.append(f"{rel}: {key} id '{i}' not found")
    for href in re.findall(r"\]\((/learn[^)\s]*)\)", data.get("prerequisites", "")):
        check_learn_path(href, str(rel))

seen: dict[str, str] = {}
for g in sorted((CONTENT / "glossary").glob("*.json")):
    for t in json.loads(g.read_text(encoding="utf-8")):
        if t["slug"] in seen:
            problems.append(f"glossary: duplicate slug '{t['slug']}' in {g.name} and {seen[t['slug']]}")
        seen[t["slug"]] = g.name
        if t.get("lesson"):
            check_learn_path("/learn/" + t["lesson"], f"glossary/{g.name}:{t['slug']}")

for f in sorted((CONTENT / "interview").glob("*.json")):
    data = json.loads(f.read_text(encoding="utf-8"))
    for s in data["sections"]:
        lesson = s.get("lesson") or s["slug"]
        if lesson not in tree.get(data["module"], {}):
            problems.append(f"interview/{f.name}: section '{s['slug']}' has no lesson '{lesson}' in module {data['module']}")

topics = sum(len(t) for m in tree.values() for t in m.values())
print(f"{len(tree)} modules, {sum(len(m) for m in tree.values())} lessons, {topics} topics; {len(sims)} sims, {len(labs)} labs, {len(scen)} scenarios")
if problems:
    print(f"\n{len(problems)} problem(s):")
    for p in problems:
        print(" -", p)
    sys.exit(1)
print("content references OK")
