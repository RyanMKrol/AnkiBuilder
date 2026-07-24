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
    modelStyling: (modelName) => invoke("modelStyling", { modelName }),
    updateModelStyling: (name, css) => invoke("updateModelStyling", { model: { name, css } }),

    // --- notes & cards ---
    findNotes: (query) => invoke("findNotes", { query }),
    notesInfo: (notes) => invoke("notesInfo", { notes }),
    findCards: (query) => invoke("findCards", { query }),
    cardsInfo: (cards) => invoke("cardsInfo", { cards }),
    addNote: (note) => invoke("addNote", { note }),
    updateNoteFields: (id, fields) => invoke("updateNoteFields", { note: { id, fields } }),
    addTags: (notes, tags) => invoke("addTags", { notes, tags }),

    // --- media & backup ---
    storeMediaFile: (params) => invoke("storeMediaFile", params),
    exportPackage: (deck, path, includeSched = true) =>
      invoke("exportPackage", { deck, path, includeSched }),
  };
}
