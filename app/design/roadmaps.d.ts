/* Types for roadmaps.js (the shared Learn in Public family module). Byte-identical in every app, like roadmaps.js. */
import "react";

export interface Family {
  readonly name: string;
  readonly author: string;
  readonly tagline: string;
  readonly hub: string;
  readonly repo: string;
}

export interface Stage {
  readonly id: "code" | "data" | "llm" | "systems";
  readonly n: number;
  readonly title: string;
  readonly text: string;
}

export type RoadmapId = "oop" | "python" | "ml" | "llm" | "rag" | "ai" | "system";

export interface Roadmap {
  readonly id: RoadmapId;
  readonly name: string;
  readonly stage: Stage["id"];
  readonly level: string;
  readonly tagline: string;
  readonly summary: string;
  /** "You're ready if…": what a learner should know before starting. */
  readonly ready: string;
  readonly stats: readonly string[];
  /** The hosted copy, or null when the roadmap only runs locally (then use `repo`). */
  readonly url: string | null;
  readonly repo: string;
  readonly next: readonly RoadmapId[];
  readonly glyph: string;
}

/** What <kr-roadmaps> saves for its app: progress counts, where to resume, and when it was last opened. */
export interface SavedProgress {
  done?: number;
  total?: number;
  href?: string;
  label?: string;
  at?: number;
}

export declare const FAMILY: Family;
export declare const STAGES: readonly Stage[];
export declare const ROADMAPS: readonly Roadmap[];
export declare function roadmapById(id: string | null | undefined): Roadmap | null;
export declare function roadmapHref(r: Roadmap): string;
export declare function nextRoadmaps(id: string | null | undefined): Roadmap[];
export declare function tileSvg(id: RoadmapId | "hub", size?: number): string;
export declare function readProgress(id: string): SavedProgress | null;
export declare function saveProgress(id: string, patch: SavedProgress): SavedProgress | null;
export declare function progressRatio(p: SavedProgress | null | undefined): number | null;

type KrBase = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      /** Top-bar "Roadmaps" switcher. `done`/`total`/`resume-*` are saved so the hub can show this app's progress. */
      "kr-roadmaps": KrBase & {
        current?: RoadmapId;
        done?: number | string;
        total?: number | string;
        "resume-href"?: string;
        "resume-label"?: string;
        /** "none" hides the text label; "always" keeps it on small screens. */
        label?: "none" | "always";
      };
      /** "Where to go next" block for a home page or the end of a course. */
      "kr-next-roadmap": KrBase & { current?: RoadmapId; heading?: string; compact?: boolean | "" };
    }
  }
}
