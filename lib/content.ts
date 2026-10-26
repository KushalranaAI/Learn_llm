// Reads the course from content/ on the server. Folder names give the order (NN-slug), JSON and markdown give the text.
//
//   content/modules/01-model-foundations/module.json
//   content/modules/01-model-foundations/01-how-networks-learn/lesson.json
//   content/modules/01-model-foundations/01-how-networks-learn/01-a-model-is-a-function.md
//   content/interview/01-model-foundations.json
//   content/glossary/01-model-foundations.json
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = path.join(process.cwd(), "content");

export type Source = { title: string; authors?: string; year?: number; note?: string; url?: string };

export type Topic = {
  slug: string;
  order: number;
  title: string;
  minutes: number;
  body: string;
  /** quick checks in this topic, used for review counts */
  checks: number;
};

export type Lesson = {
  slug: string;
  order: number;
  module: string;
  title: string;
  summary: string;
  objectives: string[];
  prerequisites: string;
  sources: Source[];
  labs: string[];
  sims: string[];
  sandbox: string[];
  topics: Topic[];
  minutes: number;
};

export type Module = {
  slug: string;
  order: number;
  title: string;
  summary: string;
  icon: string;
  /** sim id shown as the module's card picture */
  cover?: string;
  lessons: Lesson[];
  topics: number;
  minutes: number;
};

export type Question = { id: string; level: "junior" | "mid" | "senior"; q: string; a: string };
export type InterviewSection = { slug: string; title: string; module: string; lesson?: string; questions: Question[] };
export type Term = { term: string; slug: string; def: string; lesson?: string };

const ordered = (name: string) => /^(\d+)-(.+)$/.exec(name);
const dirs = (p: string) =>
  fs.existsSync(p)
    ? fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory() && ordered(d.name)).map((d) => d.name).sort()
    : [];
const readJson = <T,>(p: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
};

/** YAML frontmatter, falling back to simple `key: value` lines when a title contains an unquoted colon. */
function frontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  try {
    return matter(raw);
  } catch {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    if (!m) return { data: {}, content: raw };
    const data: Record<string, unknown> = {};
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    return { data, content: raw.slice(m[0].length) };
  }
}

const countChecks =(body: string) => (body.match(/^```quiz\s*$/gm) ?? []).length;

function loadLesson(moduleSlug: string, dir: string, name: string): Lesson {
  const [, num, slug] = ordered(name)!;
  const meta = readJson<Partial<Lesson>>(path.join(dir, "lesson.json"), {});
  const topics: Topic[] = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && ordered(f))
    .sort()
    .map((f) => {
      const [, n, rest] = ordered(f)!;
      const { data, content } = frontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
      const words = content.split(/\s+/).length;
      return {
        slug: rest.replace(/\.md$/, ""),
        order: Number(n),
        title: String(data.title ?? rest),
        minutes: Number(data.minutes ?? Math.max(2, Math.round(words / 200))),
        body: content,
        checks: countChecks(content),
      };
    });
  return {
    slug,
    order: Number(num),
    module: moduleSlug,
    title: meta.title ?? slug,
    summary: meta.summary ?? "",
    objectives: meta.objectives ?? [],
    prerequisites: meta.prerequisites ?? "",
    sources: meta.sources ?? [],
    labs: meta.labs ?? [],
    sims: meta.sims ?? [],
    sandbox: meta.sandbox ?? [],
    topics,
    minutes: topics.reduce((a, t) => a + t.minutes, 0),
  };
}

let cache: Module[] | null = null;

export function getModules(): Module[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const base = path.join(ROOT, "modules");
  cache = dirs(base).map((name) => {
    const [, num, slug] = ordered(name)!;
    const dir = path.join(base, name);
    const meta = readJson<{ title?: string; summary?: string; icon?: string; cover?: string }>(path.join(dir, "module.json"), {});
    const lessons = dirs(dir).map((l) => loadLesson(slug, path.join(dir, l), l));
    return {
      slug,
      order: Number(num),
      title: meta.title ?? slug,
      summary: meta.summary ?? "",
      icon: meta.icon ?? "book",
      cover: meta.cover,
      lessons,
      topics: lessons.reduce((a, l) => a + l.topics.length, 0),
      minutes: lessons.reduce((a, l) => a + l.minutes, 0),
    };
  });
  return cache;
}

export const getModule = (slug: string) => getModules().find((m) => m.slug === slug);
export const getLesson = (m: string, l: string) => getModule(m)?.lessons.find((x) => x.slug === l);

/** Every topic in course order, with its neighbours' addresses. */
export function flatTopics() {
  return getModules().flatMap((m) =>
    m.lessons.flatMap((l) => l.topics.map((t) => ({ module: m.slug, lesson: l.slug, topic: t.slug, title: t.title, lessonTitle: l.title }))),
  );
}

export const topicId = (m: string, l: string, t: string) => `${m}/${l}/${t}`;

export function getInterview(): InterviewSection[] {
  const base = path.join(ROOT, "interview");
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => {
      const file = readJson<{ module: string; sections: Omit<InterviewSection, "module">[] }>(path.join(base, f), { module: "", sections: [] });
      return file.sections.map((s) => ({
        ...s,
        module: file.module,
        questions: s.questions.map((q, i) => ({ ...q, id: `${s.slug}-${i + 1}` })),
      }));
    });
}

export function getGlossary(): Term[] {
  const base = path.join(ROOT, "glossary");
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => readJson<Term[]>(path.join(base, f), []))
    .sort((a, b) => a.term.localeCompare(b.term));
}

/** Small, serialisable outline for client components (sidebar, dashboard, progress). */
export function getOutline() {
  return getModules().map((m) => ({
    slug: m.slug,
    order: m.order,
    title: m.title,
    summary: m.summary,
    icon: m.icon,
    cover: m.cover,
    minutes: m.minutes,
    lessons: m.lessons.map((l) => ({
      slug: l.slug,
      order: l.order,
      title: l.title,
      summary: l.summary,
      minutes: l.minutes,
      sims: l.sims.length,
      labs: l.labs.length,
      sandbox: l.sandbox.length,
      topics: l.topics.map((t) => ({ slug: t.slug, title: t.title, minutes: t.minutes, checks: t.checks })),
    })),
  }));
}
export type Outline = ReturnType<typeof getOutline>;
