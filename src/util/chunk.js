// Splits a list into batches of at most `size` items. Shared by the LLM passes
// that batch their prompt payloads (translate, romanization eval, lesson corpus),
// which each used to carry a byte-identical private copy.
export function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
