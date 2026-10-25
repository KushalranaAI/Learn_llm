import type { Metadata } from "next";
import { Suspense } from "react";
import SandboxPage from "@/sandbox/SandboxPage";

export const metadata: Metadata = { title: "Sandbox" };

export default function Page() {
  return (
    <Suspense fallback={<div className="card">Loading the sandbox…</div>}>
      <SandboxPage />
    </Suspense>
  );
}
