// Thin AnkiConnect (https://foosoft.net/projects/anki-connect/) client. AnkiConnect exposes the running
// Anki instance over HTTP on localhost:8765; every call is a POST of `{action, version, params}` and a
// response of `{result, error}` (error non-null ⇒ failure). This wraps that protocol plus the handful of
// actions the deliverer needs. `fetchImpl` is injectable so tests can drive it with a fake (mirrors the
// `fetchTts` injection in src/audio/index.js) — no network, no running Anki.

const DEFAULT_ENDPOINT = "http://127.0.0.1:8765";
const API_VERSION = 6;

export function createAnkiConnect({
  endpoint = DEFAULT_ENDPOINT,
  version = API_VERSION,
  fetchImpl = fetch,
} = {}) {
  async function invoke(action, params = {}) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, version, params }),
      });
    } catch (e) {
      throw new Error(
        `AnkiConnect unreachable at ${endpoint} (is Anki open with the AnkiConnect add-on?): ${e.message}`,
      );
    }
    if (!res.ok) throw new Error(`AnkiConnect HTTP ${res.status} for action "${action}"`);
    const json = await res.json();
    if (json && json.error) throw new Error(`AnkiConnect "${action}" failed: ${json.error}`);
    return json ? json.result : undefined;
  }

  return {
    invoke,
    endpoint,

    // --- diagnostics ---
    version: () => invoke("version"),
    deckNames: () => invoke("deckNames"),
    // `addNote` does NOT create a missing deck — it fails with "deck was not found". Creating one is
    // idempotent in AnkiConnect (an existing name just returns its id), so this is safe to call for
    // every target deck.
    createDeck: (deck) => invoke("createDeck", { deck }),

    // Sync the collection with AnkiWeb (same as the desktop Sync button). A content-only change syncs
    // incrementally with no prompt; a SCHEMA change (new field, template edit) forces a one-way full
    // sync that Anki gates behind its GUI Upload/Download dialog — AnkiConnect can't answer that, so a
    // schema-changing delivery still needs one manual click.
    sync: () => invoke("sync"),

    // --- note type (model) structure ---
    modelNames: () => invoke("modelNames"),
    createModel: (params) => invoke("createModel", params),
    modelFieldNames: (modelName) => invoke("modelFieldNames", { modelName }),
    modelFieldAdd: (modelName, fieldName, index) =>
      invoke("modelFieldAdd", { modelName, fieldName, index }),
    modelFieldReposition: (modelName, fieldName, index) =>
      invoke("modelFieldReposition", { modelName, fieldName, index }),
    modelTemplates: (modelName) => invoke("modelTemplates", { modelName }),
    updateModelTemplates: (name, templates) =>
      invoke("updateModelTemplates", { model: { name, templates } }),
    // ⚠️ A SCHEMA-MODIFYING WRITE that generates a new card on EVERY existing note of the type, in
    // every deck of that language. `updateModelTemplates` cannot do this — handed a name the note
    // type does not have it reports success and creates nothing — which is why the add is its own
    // action. Nothing reaches it today: syncStructure refuses a template add and tells the operator
    // to make it by hand, and the guarded path behind --allow-template-add stays closed until the
    // live probes say what the write does to existing cards (src/anki/probeEvidence.js).
    modelTemplateAdd: (modelName, name, Front, Back) =>
      invoke("modelTemplateAdd", { modelName, template: { Name: name, Front, Back } }),
    modelStyling: (modelName) => invoke("modelStyling", { modelName }),
    updateModelStyling: (name, css) => invoke("updateModelStyling", { model: { name, css } }),

    // --- notes & cards ---
    findNotes: (query) => invoke("findNotes", { query }),
    notesInfo: (notes) => invoke("notesInfo", { notes }),
    findCards: (query) => invoke("findCards", { query }),
    cardsInfo: (cards) => invoke("cardsInfo", { cards }),
    // `{ "<deck name>": [cardId, ...] }` for the cards given. Far cheaper than `cardsInfo` when the
    // only question is WHICH DECKS a set of cards is spread across, which is what the model-change
    // guard needs before it rewrites a note type shared by every deck of a language.
    getDecks: (cards) => invoke("getDecks", { cards }),
    addNote: (note) => invoke("addNote", { note }),
    updateNoteFields: (id, fields) => invoke("updateNoteFields", { note: { id, fields } }),
    addTags: (notes, tags) => invoke("addTags", { notes, tags }),

    // --- card state ---
    //
    // ⚠️ These three are LIVE writes to a card's scheduling, and nothing in the delivery path calls
    // them yet. They exist for scripts/anki-behaviour-probe.mjs, which answers what they actually do
    // to a card sitting in a filtered deck before any shipping code is allowed to use them. See
    // src/anki/behaviourProbe.js: the probes run only against a throwaway profile, behind a
    // fail-closed interlock.
    suspend: (cards) => invoke("suspend", { cards }),
    unsuspend: (cards) => invoke("unsuspend", { cards }),
    changeDeck: (cards, deck) => invoke("changeDeck", { cards, deck }),

    // --- destructive: notes and decks ---
    //
    // ⚠️ These two DELETE. `deleteNotes` takes the note's cards and its whole review log with it,
    // and nothing about it is recoverable from Anki afterwards, only from a backup.
    //
    // `deleteDecks` USED to take cardsToo:false, which moved any cards left in the deck to Default
    // instead of deleting them, and this wrapper defaulted to that as a safety net. Anki removed the
    // option in 2.1.28: the call now fails outright with "it's not possible to delete decks without
    // deleting cards as well". So the net was not a net. It was a call that could only ever throw,
    // and it read as the safest of the two choices right up until it ran.
    //
    // There is no flag-shaped replacement. The guarantee has to come from the caller: COUNT THE
    // CARDS IN THE DECK AND REFUSE IF IT IS NOT ZERO, then delete. That is strictly stronger than
    // the old flag anyway — the flag rescued cards after being wrong about emptiness, where the
    // check means never being wrong about it — which is why `cardsToo` is now a required argument
    // with no default: passing it should be a decision at the call site, not something inherited.
    //
    // Nothing in the delivery path calls either one, by design: deliver never deletes, it reports a
    // dropped card as `orphaned` for a human to act on. They exist for the retirement of a whole
    // collection, which is a decision a person makes once and then wants carried out exactly.
    deleteNotes: (notes) => invoke("deleteNotes", { notes }),
    deleteDecks: (decks, cardsToo) => invoke("deleteDecks", { decks, cardsToo }),

    // --- media & backup ---
    storeMediaFile: (params) => invoke("storeMediaFile", params),
    exportPackage: (deck, path, includeSched = true) =>
      invoke("exportPackage", { deck, path, includeSched }),
  };
}
