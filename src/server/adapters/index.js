import { bookAdapter } from "./book.js";
import { courseAdapter } from "./course.js";
import { templateAdapter } from "./template.js";

// The deck-format registry. Each adapter knows how to discover, load, and resolve media for one
// on-disk deck layout. THIS is the extension point: when a new deck format/layout is introduced,
// add an adapter module and register it here — the dashboard then ingests it with no other changes.
export const ADAPTERS = [bookAdapter, courseAdapter, templateAdapter];

export function getAdapter(type) {
  return ADAPTERS.find((a) => a.type === type) || null;
}

// Every deck across every format, for the dashboard index.
export function listAllDecks(outputRoot, adapters = ADAPTERS) {
  return adapters.flatMap((a) => a.listDecks(outputRoot));
}
