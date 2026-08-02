// The model is asked for raw JSON but occasionally wraps it in a markdown code
// fence (```json ... ```) anyway. Strip that before parsing rather than failing
// the whole batch over formatting. Shared by the passes that parse a JSON array
// response, which each used to carry a byte-identical private copy.
export function stripMarkdownFence(text) {
  const match = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return match ? match[1] : text;
}
