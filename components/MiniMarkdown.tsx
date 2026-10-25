"use client";
// Markdown with maths only: for sim explanations, quiz feedback and interview answers (no directives, no diagrams).
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { fixMath } from "@/lib/mathfix";

export default function MiniMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`prose prose-sm ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {fixMath(children)}
      </ReactMarkdown>
    </div>
  );
}
