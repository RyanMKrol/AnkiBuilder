# Reader: chapter-4 (Chapter 05: Lesson 3: Making a Date)

Collection: genki-an-integrated-course-in-elementary-japanese-i-third-ed-reading. One unit, no extras.
Source: `chapter-outline.mjs af43edd86648b83e 5`, read to the END OF CHAPTER line. The 33 images are
dialogue art, conjugation and schedule drill pictures, the 行く/来る viewpoint diagram and the
Culture Note photos. I opened the ones that could hold words (pages 92, 102, 103, 107, 110). The
outline already transcribes each one, and none holds a word list or kanji table the text lacks.
This is a Dialogue and Grammar lesson, so it prints no kanji table. The deck's single-kanji cards
take their meanings from the book's later Reading and Writing tables (Chapters 17 to 26) where the
book teaches them, and from KANJIDIC2 otherwise.

## What the chapter teaches

**Vocabulary list (56 entries)**

- Entertainment and Sports: 映画, 音楽, 雑誌, スポーツ, デート, テニス, テレビ
- Foods and Drinks: アイスクリーム, ハンバーガー, お酒, お茶, コーヒー, 水, 朝ご飯, 昼ご飯, 晩ご飯
- Places: 家, うち, 学校, カフェ
- Time: 明日, 今日, 朝, 今晩, 毎日, 毎晩, 週末, 土曜日, 日曜日, いつ, 〜ごろ
- U-verbs: 行く, 帰る, 聞く, 飲む, 話す, 読む
- Ru-verbs: 起きる, 食べる, 寝る, 見る
- Irregular verbs: 来る, する, 勉強する
- Adjectives: いい, 早い
- Adverbs: あまり, 全然, たいてい, ちょっと, 時々, よく
- Expressions: そうですね, でも, どうですか, ええ

**Culture Note labels (6)**: 畳, ふすま, 障子, 玄関, トイレ, お風呂

**Expression Notes (3)**: 行く/来る (both in the list), ちょっと as a polite refusal (in the list),
はい/ええ/うん (kana; はい was taught earlier).

**Grammar (8 points, out of scope for a reading deck)**: verb groups and the dictionary form, the
present tense ます/ません conjugation (the three tables), habitual and future meaning, the particles
を, で, に, へ, time references with and without に, 〜ませんか invitations, frequency adverbs with
negatives, word order, and は on non-subject topics.

## Coverage, item by item

Vocabulary:

- Carded in this unit (35): 映画, 音楽, 雑誌, お酒, お茶, 水, 朝ご飯, 昼ご飯, 晩ご飯, 家, 学校,
  明日, 今日, 朝, 今晩, 毎日, 毎晩, 週末, 土曜日, 日曜日, 行く, 帰る, 聞く, 飲む, 話す, 読む, 起きる,
  食べる, 寝る, 見る, 来る, 勉強する, 早い, 全然, 時々. Every one uses the kanji spelling the book
  prints, and every English matches the book's gloss.
- In the kana deck (chapter-26, 11): スポーツ, デート, テニス, テレビ, アイスクリーム, ハンバーガー,
  コーヒー, カフェ, いい, ちょっと, そうですね.
- Kana-only and not chosen by the kana deck's budget (10): うち, いつ, ごろ, する, あまり, たいてい,
  よく, でも, どうですか, ええ. These sit in this unit's kanaPool. Under
  `docs/designs/reading-decks/09-kana-deck.md` that is by design, not a gap. The reading report's
  drop reason ("carded in the collection's kana deck") overstates this. That was already ruled a
  tooling message, not a card finding, in the chapter-7 pilot, so I do not report it again.

Culture note:

- 畳, 障子, 玄関 and お風呂 are carded here, and トイレ is in the kana deck. ふすま is kana-only and not
  chosen. The note is covered consistently, unlike the chapter-7 school diagram.

Kanji: every kanji used by a word in this unit has a character card here (44 character cards, from
明 to 起). 々 correctly has no card. Preflight's one-card-per-written-form check confirms none of
them is duplicated elsewhere in the collection. 水, 朝, 家 and 畳 are single characters the book
teaches as words, so each is one voiced word card (rule 4), which is right.

Proper names (京都, Mary, Takeshi, Professor Yamashita) and exercise-only words (図書館, 郵便局,
コンビニ, バドミントン and so on) are correctly not carded here.

Grammar: out of scope by design for a reading deck. Not a finding.

## Faithful

All 39 word cards match the book's spelling, reading and gloss, including the scoped ones: "Date
(romantic, not calendar)" in the kana pool, "To go back; to return", "To see; to look at; to watch",
and "Sake; alcoholic drink". For the 25 kanji the book teaches later, the card's English matches the
book's table entry word for word (明 "Bright", 映 "To reflect", 勉 "To make efforts", 土 "Soil", 帰
"To return" and so on). The KANJIDIC-sourced meanings (週, 末, 寝, 誌, 飯, 然, 酒, 障, 昼, 風, 晩, 全, 楽,
音, 関, 雑, 茶, 玄, 呂) are correct, and 呂 follows rule 9's "used for its sound" wording.

Things I checked and left alone:

- 11 book-sourced kanji cards (明, 今, 日, 行, 食, 聞, 強, 来, 子, 映, 読) show readings the book's
  table does not list. For example, 日 shows "ni, nichi, nit-, jitsu / bi, hi, ka" where the book
  lists に にち にっ / び ひ か. Commit a09b2a0 ("Kanji cards: complete readings to the official
  school list") did this on purpose. The extra readings are real, so this is a design decision, not
  a mismatch. The cards' hidden reviewNote ("Meaning and readings from the book") is now
  slightly stale, but it is never shown to the learner.
- Character and word pairs that share an English (行/行く "To go", 校/学校 "School", 早/早い
  "Early" and the rest) sit outside rule 9's examples. The chapter-7 pilot left these alone too.
- 障子 "Sliding door": the book introduces it beside ふすま as "two types of sliding doors". ふすま
  has no card, so nothing collides.
- 全然 "Not at all" beside the kana deck's いいえ "No; not at all": the two English strings differ
  and both follow the book.

## Findings

None. Preflight reports nothing for this unit beyond passes, and I found no gap, mismatch, wrong
content, untaught prerequisite or proper-name card.

## Counts

- Items the chapter teaches (excluding the 8 grammar points): 62 (56 vocabulary entries and 6
  culture-note labels)
- Items carded (here or in the kana deck): 51. The other 11 are kana-only words the kana budget
  did not choose, which is by design.
- Cards checked: 83 shipping (39 words, 44 characters), 0 excluded
- Cards with a finding: 0
