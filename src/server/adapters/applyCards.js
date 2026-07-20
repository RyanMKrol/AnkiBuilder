import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { validateCards as defaultValidateCards } from "../../model/index.js";
import { httpError } from "../../util/httpError.js";

// Write-back for the dashboard translate review — non-audio edits to cards.json (exclude a card,
// or fix its target/pronunciation/reading). Each is a read-modify-write targeting the item by `id`.
// (Audio edits live in applyCardAudio.js; corpus edits in applyCorpus.js.)

const EDITABLE_FIELDS = ["target", "pronunciation", "reading"];

function loadCards(runDir) {
  const cardsPath = join(runDir, "cards.json");
  if (!existsSync(cardsPath)) throw httpError(404, "cards.json not found for this deck unit");
  return { cardsPath, data: JSON.parse(readFileSync(cardsPath, "utf-8")) };
}

function findItem(data, cardId) {
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `card ${JSON.stringify(cardId)} not found`);
  return item;
}

function persist(cardsPath, data, validateCards) {
  try {
    validateCards(data);
  } catch (e) {
    throw httpError(400, `invalid card data after edit: ${e.message}`);
  }
  writeFileSync(cardsPath, JSON.stringify(data, null, 2));
}

// Toggle a card's exclusion flag (reversible — a flag, not a delete). The deck build drops excluded
// cards.
export function setCardExcluded(
  runDir,
  cardId,
  excluded,
  { validateCards = defaultValidateCards } = {},
) {
  const { cardsPath, data } = loadCards(runDir);
  const item = findItem(data, cardId);
  if (excluded) item.excluded = true;
  else delete item.excluded;
  persist(cardsPath, data, validateCards);
  return { excluded: !!excluded };
}

// Edit a card's translate-stage text fields. Only the whitelisted fields are ever written, and each
// is coerced to a string; anything else in the body is ignored.
export function editCard(runDir, cardId, fields, { validateCards = defaultValidateCards } = {}) {
  const { cardsPath, data } = loadCards(runDir);
  const item = findItem(data, cardId);
  const applied = {};
  for (const key of EDITABLE_FIELDS) {
    if (fields && Object.prototype.hasOwnProperty.call(fields, key)) {
      item[key] = String(fields[key]);
      applied[key] = item[key];
    }
  }
  persist(cardsPath, data, validateCards);
  return applied;
}
