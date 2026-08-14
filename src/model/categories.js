// Single canonical list of topical categories usable across any target language,
// any word, any sentence. The first 8 match the travel-essentials template's
// existing categories (kept unchanged so nothing there needs renaming); the rest
// extend coverage toward full textbook chapters. First-cut list — revisit if it
// proves too coarse or fine in practice.
export const CATEGORIES = [
  "Greetings",
  "Numbers",
  "Directions",
  "Food",
  "Transport",
  "Money",
  "Time",
  "Emergencies",
  "Family & People",
  "Colors",
  "Weather & Nature",
  "Home & Household",
  "Body & Health",
  "Clothing",
  "Work & Occupations",
  "School & Education",
  "Technology & Communication",
  "Sports & Hobbies",
  "Emotions & Feelings",
  "Animals",
  "Travel & Tourism",
  "Nationalities & Countries",
  "Shopping",
  "Grammar & Function Words",
  // Added 2026-08. "Other" was the second-largest bucket in the one book built so far (222 cards),
  // and most of it was adjectives and ordinary objects that had nowhere topical to go. A bucket that
  // big says nothing about what a card is, and the review surfaces group by category.
  "Descriptions & Qualities",
  "Everyday Objects",
  "Other",
];
