// A lab is a short guided challenge: read, predict, compute by hand, then prove it in a simulation or the sandbox.
import type { DesignTest, Graph, NodeKind } from "@/sandbox/types";
import type { Goal, Params } from "@/sims/types";

export type LabStep =
  | { type: "intro"; title: string; body: string }
  | { type: "quiz"; title: string; body: string; question: string; options: { text: string; correct?: boolean; why: string }[] }
  | {
      /** work a number out by hand (with the maths in `body`), checked within a tolerance */
      type: "math";
      title: string;
      body: string;
      question: string;
      answer: number;
      /** relative tolerance, e.g. 0.05 = within 5% */
      tolerance: number;
      unit?: string;
      hint: string;
      /** worked solution, markdown + KaTeX */
      solution: string;
    }
  | {
      type: "sim";
      title: string;
      body: string;
      sim: string;
      params?: Params;
      locked?: string[];
      hidden?: string[];
      goals: Goal[];
      hints: string[];
      /** params that meet every goal: verified by tests */
      solution: Params;
    }
  | {
      type: "design";
      title: string;
      body: string;
      starter?: Graph;
      palette?: NodeKind[];
      test: DesignTest;
      hints: string[];
      /** a design that passes: verified by tests */
      solution: Graph;
    };

export interface Lab {
  slug: string;
  /** module slug */
  module: string;
  title: string;
  /** the product or situation, e.g. "Bank support chat" */
  product: string;
  summary: string;
  difficulty: "easy" | "medium" | "hard";
  minutes: number;
  tags: string[];
  steps: LabStep[];
}
