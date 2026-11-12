"use client";
// "From earlier": one quick check from a lesson this one builds on, at the end of every topic. Mixing a little
// old material into new work is cumulative review: it keeps earlier lessons alive without a separate study session.
// The answer is recorded under the original topic, so it schedules and masters the same review item.
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import Quiz from "./Quiz";

export type RecallItem = { topic: string; topicTitle: string; lessonTitle: string; quiz: { q: string; options: string[]; answer: number; explain?: string } };

export default function Recall({ item }: { item: RecallItem }) {
  return (
    <section className="recall" aria-label="From earlier">
      <Quiz raw={JSON.stringify(item.quiz)} label={`From earlier · ${item.lessonTitle}`} icon="refresh" topicOverride={{ id: item.topic, title: item.topicTitle }} />
      <p className="muted small recall-src">
        <Icon name="book" size={13} /> From <Link href={`/learn/${item.topic}`}>{item.topicTitle}</Link>. Recalling older material while you learn new material is what keeps it.
      </p>
    </section>
  );
}
