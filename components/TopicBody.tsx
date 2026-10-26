"use client";
// A topic's markdown, with the topic's identity available to its quick checks (for spaced review).
// It also tells the optional AI tutor what is on screen (quick-check answers are stripped first).
import { stripAnswers, useChatSource } from "@/lib/ai/sources";
import Markdown from "./Markdown";
import { TopicContext } from "./lesson/Quiz";

export default function TopicBody({ id, title, body, lesson }: { id: string; title: string; body: string; lesson?: string }) {
  useChatSource("topic", {
    label: `Topic · ${title}`,
    suggestions: ["Explain this topic like I'm new to it", "Walk me through the maths step by step", "Give me a worked example with real numbers", "Quiz me with 3 questions, one at a time"],
    build: () => `${lesson ? `Lesson: ${lesson}\n` : ""}Topic: ${title}\n\n${stripAnswers(body)}`,
  });
  return (
    <TopicContext.Provider value={{ id, title }}>
      <Markdown>{body}</Markdown>
    </TopicContext.Provider>
  );
}
