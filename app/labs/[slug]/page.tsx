import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LabPlayer from "@/components/LabPlayer";
import { getLab, LABS } from "@/labs";

export function generateStaticParams() {
  return LABS.length ? LABS.map((l) => ({ slug: l.slug })) : [{ slug: "none" }];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getLab(slug)?.title ?? "Lab" };
}

export default async function LabPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getLab(slug)) notFound();
  return <LabPlayer slug={slug} />;
}
