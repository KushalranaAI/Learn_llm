// Course text writes currency as `\$` and sometimes puts one inside maths, e.g. `$1.5 \times 1.16 \approx \$1.74$`.
// The markdown maths parser has no escapes inside a maths span: it closes the span at that `$`, cutting the formula off.
// This pass rewrites a `\$` that sits *inside* a maths span to KaTeX's `\char36`, and leaves `\$` in prose alone
// (markdown turns it into a literal dollar sign). Fenced and inline code are untouched.
export function fixMath(src: string): string {
  if (!src.includes("\\$")) return src;
  const out: string[] = [];
  let mode: "text" | "inline" | "display" = "text";
  let fenced = false;

  for (const line of src.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      out.push(line);
      continue;
    }
    if (fenced) {
      out.push(line);
      continue;
    }
    if (mode === "inline" && line.trim() === "") mode = "text"; // inline maths cannot span paragraphs

    let res = "";
    for (let i = 0; i < line.length; ) {
      const c = line[i];
      const n = line[i + 1];
      if (mode === "text") {
        if (c === "\\" && (n === "$" || n === "\\")) {
          res += c + n;
          i += 2;
        } else if (c === "`") {
          let run = 1;
          while (line[i + run] === "`") run++;
          const end = line.indexOf("`".repeat(run), i + run);
          if (end < 0) {
            res += line.slice(i);
            i = line.length;
          } else {
            res += line.slice(i, end + run);
            i = end + run;
          }
        } else if (c === "$") {
          mode = n === "$" ? "display" : "inline";
          res += mode === "display" ? "$$" : "$";
          i += mode === "display" ? 2 : 1;
        } else {
          res += c;
          i++;
        }
      } else if (c === "\\" && n === "$") {
        res += "\\char36 ";
        i += 2;
      } else if (c === "\\" && n === "\\") {
        res += "\\\\";
        i += 2;
      } else if (c === "$" && (mode === "inline" || n === "$")) {
        res += mode === "display" ? "$$" : "$";
        i += mode === "display" ? 2 : 1;
        mode = "text";
      } else {
        res += c;
        i++;
      }
    }
    out.push(res);
  }
  return out.join("\n");
}
