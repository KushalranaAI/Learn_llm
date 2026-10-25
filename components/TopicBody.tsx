"use client";
// A topic's markdown, with the topic's identity available to its quick checks (for spaced review).
import Markdown from "./Markdown";
import { TopicContext } from "./lesson/Quiz";

export default function TopicBody({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <TopicContext.Provider value={{ id, title }}>
      <Markdown>{body}</Markdown>
    </TopicContext.Provider>
  );
}
