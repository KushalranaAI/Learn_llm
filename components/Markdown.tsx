"use client";
// Course markdown: GitHub tables, $math$ / $$math$$ (KaTeX), highlighted code, ```mermaid diagrams, and the lesson
// directives ```quiz, ```steps, ```sim, ```lab, ```sandbox and ```callout-<kind> (see CONTENT_GUIDE.md).
import Link from "next/link";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Callout, type CalloutKind, LabCard, SandboxCard, SimEmbed, Steps } from "./lesson/Blocks";
import Quiz from "./lesson/Quiz";
import Mermaid from "./Mermaid";
import { fixMath } from "@/lib/mathfix";
import Icon from "./ui/Icon";

type HastNode = { type?: string; value?: string; tagName?: string; children?: HastNode[]; properties?: { className?: string[] } };
const hastText = (n: HastNode): string => (n.type === "text" ? (n.value ?? "") : (n.children ?? []).map(hastText).join(""));
/** Same rule as the search index, so "Section" results land on the heading. */
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="chip-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
    </button>
  );
}

const render = (md: string) => <Markdown>{md}</Markdown>;

function directive(lang: string, text: string) {
  if (lang === "mermaid") return <Mermaid chart={text.trim()} />;
  if (lang === "quiz") return <Quiz raw={text} />;
  if (lang === "steps") return <Steps raw={text.trim()} render={render} />;
  if (lang === "sim") return <SimEmbed raw={text.trim()} />;
  if (lang === "lab") return <LabCard raw={text} />;
  if (lang === "sandbox") return <SandboxCard raw={text} />;
  if (lang.startsWith("callout-")) return <Callout kind={lang.slice(8) as CalloutKind} raw={text.trim()} render={render} />;
  return null;
}

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          pre(props) {
            const code = (props.node as HastNode | undefined)?.children?.find((c) => c.tagName === "code");
            const lang = code?.properties?.className?.find((c) => c.startsWith("language-"))?.slice(9) ?? "";
            const text = code ? hastText(code).replace(/\n$/, "") : "";
            const special = directive(lang, text);
            if (special) return special;
            return (
              <div className="codeblock">
                <div className="codeblock-bar">
                  <span className="codeblock-lang">{lang || "text"}</span>
                  <CopyButton text={text} />
                </div>
                <pre>{props.children}</pre>
              </div>
            );
          },
          h2(props) {
            const { node, ...rest } = props;
            return <h2 id={slugify(hastText(node as HastNode))} {...rest} />;
          },
          h3(props) {
            const { node, ...rest } = props;
            return <h3 id={slugify(hastText(node as HastNode))} {...rest} />;
          },
          table(props) {
            const { node, ...rest } = props;
            void node;
            return <div className="table-wrap"><table {...rest} /></div>;
          },
          a(props) {
            const { node, ...rest } = props;
            void node;
            if (props.href?.startsWith("/")) return <Link href={props.href}>{rest.children}</Link>;
            const external = props.href?.startsWith("http");
            return <a {...rest} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} />;
          },
        }}
      >
        {fixMath(children)}
      </ReactMarkdown>
    </div>
  );
}
