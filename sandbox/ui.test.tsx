import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { SandboxCanvas } from "./Canvas";
import GuidePanel from "./GuidePanel";
import Inspector from "./Inspector";
import { run } from "./engine";
import { describeDesign, explain, whatIfs } from "./explain";
import { getScenario } from "./scenarios";
import { runTimeline, summarize } from "./timeline";

describe("sandbox UI renders (SSR smoke test)", () => {
  const sc = getScenario("rag-production")!;
  const r = run(sc.graph);
  it("SandboxCanvas", () => {
    const html = renderToString(<SandboxCanvas initial={sc.graph} palette={["llm-api", "semantic-cache"]} result={r} height={400} />);
    expect(html).toContain("sbx-embed");
  });
  it("Inspector with a selected node and with none", () => {
    const html = renderToString(<Inspector graph={sc.graph} selected="llm" onChange={() => {}} onSelect={() => {}} result={r} />);
    expect(html).toContain("Model tier");
    expect(renderToString(<Inspector graph={sc.graph} selected={null} onChange={() => {}} onSelect={() => {}} />)).toContain("Inspector");
  });
  it("GuidePanel before and after a run with a timeline", () => {
    const pre = renderToString(<GuidePanel intro={describeDesign(sc.graph)} tryThis={sc.tryThis} result={null} guide={null} whatIfs={[]} ticks={null} timelineSummary={null} timelineText={null} incident={{ type: "none" }} stale={false} onApply={() => {}} onSelect={() => {}} onRun={() => {}} />);
    expect(pre).toContain("Things to try");
    const ticks = runTimeline(sc.graph, {}, sc.incident!);
    const post = renderToString(<GuidePanel intro={[]} result={r} guide={explain(sc.graph, r)} whatIfs={whatIfs(sc.graph, {}, r)} ticks={ticks} timelineSummary={summarize(ticks)} timelineText="x" incident={sc.incident!} stale={false} onApply={() => {}} onSelect={() => {}} onRun={() => {}} />);
    expect(post).toContain("What if");
    expect(post).toContain("Success rate");
  });
});
