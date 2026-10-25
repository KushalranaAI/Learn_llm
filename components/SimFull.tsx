"use client";
// A simulation at full size, by id (sim definitions hold functions, so they are looked up on the client).
import { useEffect } from "react";
import { markSimTried } from "@/lib/progress";
import { getSim } from "@/sims";
import { SimPanel } from "@/sims/ui";

export default function SimFull({ id }: { id: string }) {
  const def = getSim(id);
  useEffect(() => markSimTried(id), [id]);
  if (!def) return <div className="card empty">Unknown simulation.</div>;
  return <SimPanel def={def} />;
}
