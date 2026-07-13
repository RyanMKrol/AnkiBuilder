import { test } from "node:test";
import { strict as assert } from "node:assert";
import { renderAuditTable } from "../../src/audit/index.js";

test("renderAuditTable renders a table with all card columns", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "hello",
        target: "hola",
        pronunciation: "OH-la",
        category: "greeting",
      },
      {
        id: "2",
        english: "goodbye",
        target: "adiós",
        pronunciation: "ah-dee-OHS",
        category: "greeting",
      },
    ],
  };

  const result = renderAuditTable(cards);

  // Verify English text is present
  assert.match(result, /hello/, "Should contain English text");
  assert.match(result, /goodbye/, "Should contain English text");

  // Verify target text is present
  assert.match(result, /hola/, "Should contain target text");
  assert.match(result, /adiós/, "Should contain target text");

  // Verify pronunciation is present
  assert.match(result, /OH-la/, "Should contain pronunciation");

  // Verify category is present
  assert.match(result, /greeting/, "Should contain category");
});

test("renderAuditTable renders image flag as ✓ when image present", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "apple",
        target: "manzana",
        pronunciation: "man-ZA-na",
        category: "fruit",
        image: "apple.jpg",
      },
    ],
  };

  const result = renderAuditTable(cards);

  assert.match(result, /✓/, "Should contain checkmark for image");
});

test("renderAuditTable renders image flag as · when image absent", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "apple",
        target: "manzana",
        pronunciation: "man-ZA-na",
        category: "fruit",
      },
    ],
  };

  const result = renderAuditTable(cards);

  assert.match(result, /·/, "Should contain dot for no image");
});

test("renderAuditTable renders audio flag as ✓ when audio present", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "apple",
        target: "manzana",
        pronunciation: "man-ZA-na",
        category: "fruit",
        audio: "manzana.mp3",
      },
    ],
  };

  const result = renderAuditTable(cards);

  assert.match(result, /✓/, "Should contain checkmark for audio");
});

test("renderAuditTable renders audio flag as · when audio absent", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "apple",
        target: "manzana",
        pronunciation: "man-ZA-na",
        category: "fruit",
      },
    ],
  };

  const result = renderAuditTable(cards);

  assert.match(result, /·/, "Should contain dot for no audio");
});

test("renderAuditTable shows correct image count in totals", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "apple",
        target: "manzana",
        pronunciation: "man-ZA-na",
        category: "fruit",
        image: "apple.jpg",
      },
      {
        id: "2",
        english: "banana",
        target: "plátano",
        pronunciation: "PLA-ta-no",
        category: "fruit",
      },
      {
        id: "3",
        english: "orange",
        target: "naranja",
        pronunciation: "na-RAN-ha",
        category: "fruit",
        image: "orange.jpg",
      },
    ],
  };

  const result = renderAuditTable(cards);

  // Should show 2 cards with images
  assert.match(result, /2/, "Should show correct image count");
  // Should end with 3 total
  assert.match(result, /3 total/, "Should show total card count");
});

test("renderAuditTable shows correct audio count in totals", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "hello",
        target: "hola",
        pronunciation: "OH-la",
        category: "greeting",
        audio: "hola.mp3",
      },
      {
        id: "2",
        english: "goodbye",
        target: "adiós",
        pronunciation: "ah-dee-OHS",
        category: "greeting",
        audio: "adios.mp3",
      },
      {
        id: "3",
        english: "thank you",
        target: "gracias",
        pronunciation: "GRA-see-as",
        category: "politeness",
      },
    ],
  };

  const result = renderAuditTable(cards);

  // Should show 2 cards with audio
  assert.match(result, /2/, "Should show correct audio count");
  // Should end with 3 total
  assert.match(result, /3 total/, "Should show total card count");
});

test("renderAuditTable groups and sorts by category then english", () => {
  const cards = {
    items: [
      {
        id: "3",
        english: "zebra",
        target: "cebra",
        pronunciation: "ZE-bra",
        category: "animal",
      },
      {
        id: "1",
        english: "apple",
        target: "manzana",
        pronunciation: "man-ZA-na",
        category: "fruit",
      },
      {
        id: "2",
        english: "banana",
        target: "plátano",
        pronunciation: "PLA-ta-no",
        category: "fruit",
      },
      {
        id: "4",
        english: "aardvark",
        target: "oso hormiguero",
        pronunciation: "O-so or-mi-GUE-ro",
        category: "animal",
      },
    ],
  };

  const result = renderAuditTable(cards);
  const lines = result.split("\n");

  // Find indices of each word (accounting for header and separators)
  const findLine = (word) => lines.findIndex((l) => l.includes(word));

  // Animal category comes before fruit alphabetically
  const aardvarkIdx = findLine("aardvark");
  const zebraIdx = findLine("zebra");
  const appleIdx = findLine("apple");
  const bananaIdx = findLine("banana");

  assert(aardvarkIdx < zebraIdx, "Aardvark should come before zebra (both in animal category)");
  assert(zebraIdx < appleIdx, "Animal category should come before fruit category");
  assert(bananaIdx > appleIdx, "Banana should come after apple (both in fruit)");
});

test("renderAuditTable handles wide/non-Latin scripts", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "hello",
        target: "你好",
        pronunciation: "nǐ hǎo",
        category: "greeting",
        image: "hello.jpg",
      },
      {
        id: "2",
        english: "goodbye",
        target: "さようなら",
        pronunciation: "sayōnara",
        category: "greeting",
        audio: "goodbye.mp3",
      },
      {
        id: "3",
        english: "thank you",
        target: "감사합니다",
        pronunciation: "gamsahamnida",
        category: "politeness",
      },
    ],
  };

  const result = renderAuditTable(cards);

  // Should contain all Chinese, Japanese, and Korean text
  assert.match(result, /你好/, "Should display Chinese characters");
  assert.match(result, /さようなら/, "Should display Japanese characters");
  assert.match(result, /감사합니다/, "Should display Korean characters");

  // Should have proper flags (checkmarks for image on hello and audio on goodbye)
  assert.match(result, /✓/, "Should have at least one checkmark for image or audio");
  // Verify the table is parseable (lines should align)
  const lines = result.split("\n");
  assert(lines.length > 3, "Should produce multiple lines");
  // Count occurrences of checkmarks and dots
  const checkmarks = (result.match(/✓/g) || []).length;
  const dots = (result.match(/·/g) || []).length;
  assert.equal(checkmarks, 2, "Should have 2 checkmarks (1 image + 1 audio)");
  assert.equal(dots, 4, "Should have 4 dots (no image for 2 cards, no audio for 2 cards)");
});

test("renderAuditTable handles empty cards array", () => {
  const cards = {
    items: [],
  };

  const result = renderAuditTable(cards);

  assert.match(result, /No cards to audit/, "Should handle empty cards");
});

test("renderAuditTable handles missing items property gracefully", () => {
  const cards = {};

  const result = renderAuditTable(cards);

  assert.match(result, /No cards to audit/, "Should handle missing items property");
});

test("renderAuditTable handles null or undefined input", () => {
  let result;

  result = renderAuditTable(null);
  assert.match(result, /No cards to audit/, "Should handle null input");

  result = renderAuditTable(undefined);
  assert.match(result, /No cards to audit/, "Should handle undefined input");
});

test("renderAuditTable shows total count accurately", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "one",
        target: "uno",
        pronunciation: "OO-no",
        category: "number",
      },
      {
        id: "2",
        english: "two",
        target: "dos",
        pronunciation: "dos",
        category: "number",
      },
      {
        id: "3",
        english: "three",
        target: "tres",
        pronunciation: "tres",
        category: "number",
      },
      {
        id: "4",
        english: "four",
        target: "cuatro",
        pronunciation: "KWA-tro",
        category: "number",
      },
      {
        id: "5",
        english: "five",
        target: "cinco",
        pronunciation: "SEEN-ko",
        category: "number",
      },
    ],
  };

  const result = renderAuditTable(cards);

  // Should show 5 total at the end
  assert.match(result, /5 total/, "Should show correct total of 5");
});

test("renderAuditTable preserves all card data in output", () => {
  const cards = {
    items: [
      {
        id: "1",
        english: "dog",
        target: "perro",
        pronunciation: "PE-rro",
        category: "animal",
        image: "dog.jpg",
        audio: "perro.mp3",
      },
    ],
  };

  const result = renderAuditTable(cards);

  assert.match(result, /dog/, "Should have english");
  assert.match(result, /perro/, "Should have target");
  assert.match(result, /PE-rro/, "Should have pronunciation");
  assert.match(result, /animal/, "Should have category");
  assert.match(result, /✓.*✓/, "Should have both image and audio flags");
});
