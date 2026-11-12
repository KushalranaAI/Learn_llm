// A short, stable hash of a string (djb2, base 36). Quick-check ids are `${topicId}#${hashText(question)}`,
// computed the same way on the server (mastery, recall picks) and in the browser (recording answers).
export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
