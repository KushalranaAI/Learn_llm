import type { Metadata } from "next";
import AISettingsPage from "@/components/ai/AISettingsPage";

export const metadata: Metadata = { title: "AI tutor", description: "Optional: connect your own AI (Claude, OpenAI, Gemini, Azure OpenAI or a local model) for a tutor that can see what you are studying." };

export default function Page() {
  return <AISettingsPage />;
}
