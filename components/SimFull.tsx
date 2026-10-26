"use client";
// A simulation at full size in the workspace layout (sim definitions hold functions, so they are looked up on the client).
import { useEffect } from "react";
import { markSimTried } from "@/lib/progress";
import { getSim } from "@/sims";
import SimWorkspace from "@/sims/workspace";

export default function SimFull({ id }: { id: string }) {
  const def = getSim(id);
  useEffect(() => markSimTried(id), [id]);
  if (!def) return <div className="card empty">Unknown simulation.</div>;
  return <SimWorkspace def={def} />;
}
