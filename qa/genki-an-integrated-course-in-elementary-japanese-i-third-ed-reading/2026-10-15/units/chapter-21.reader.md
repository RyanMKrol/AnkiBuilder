# Reader: chapter-21 (Chapter 22: Reading and Writing 8: Japanese Office Workers)

Collection: genki-an-integrated-course-in-elementary-japanese-i-third-ed-reading. One unit, no extras.

Source: `chapter-outline.mjs af43edd86648b83e 22`, read to the END OF CHAPTER line. All 14 pictures
opened. Eleven are crops of the kanji table (an entry's last example line plus the next stroke-order
row), and every word in them is also in the outline text. Three (page-338-fig-8, page-339-fig-5 and
fig-6) are blank. Genki shades words already taught (新しい, 新聞, 聞く, 作る, 仕事, 電車, 電気, 車,
言う, 次, 何, 何時, 何人); the shading does not change what is taught here.

## What the chapter teaches

**Kanji table, entries 073 to 086 (14 characters):** 員 (member), 新 (new), 聞 (to listen), 作 (to
make), 仕 (to serve), 事 (thing), 電 (electricity), 車 (car), 休 (to rest), 言 (to say), 読 (to
read), 思 (to think), 次 (next), 何 (what).

**Example words the table prints with readings (51, of which 4 are single-kanji words):**

- 員: 会社員, 店員, 会員, 駅員
- 新: 新しい, 新聞, 新幹線, 新鮮な
- 聞: 聞く, 新聞, 聞こえる
- 作: 作る, 作文, 作品, 作者
- 仕: 仕事, 仕返し, 仕える
- 事: 仕事, 事 (こと, thing), 火事, 食事, 返事
- 電: 電車, 電気, 電話, 電池, 電子レンジ
- 車: 車 (くるま, car), 電車, 自転車, 車いす, 駐車場
- 休: 休む, 休み, 休日
- 言: 言う, 言語学, 方言, 言葉
- 読: 読む, 読書, 読み物
- 思: 思う, 不思議な, 思い出す
- 次: 次 (つぎ, next), 次女, 目次, 次回
- 何: 何 (なに, what), 何時, 何人, 何か

**Glossary under the questionnaire (II-A):** アンケート, ストレス, 残業 (ざんぎょう) overtime work,
～の後 (～のあと) after.

**Glossary under the report (II-C):** 疲れている (つかれている) to be tired, 答える (こたえる) to answer,
この間 (このあいだ) the other day, 次に secondly (no reading printed), 話 (はなし) story; talk,
最後に (さいごに) lastly, まず first of all.

アンケート, ストレス and まず are kana-only, so they belong to the kana deck's budget, not to this unit
(the build put all three in `kanaPool`). Sections I-A (kanji parts), I-B (verb matching), the
questionnaire, the report, its questions and III (writing practice) reuse words from the table and
from earlier lessons. Passage-only words (留学生, 大変, お酒, 帰る, 出かける and so on) have no gloss
here and are not taught by this chapter.

After merging the four single-kanji words with their kanji (事, 車, 次, 何) and dropping the repeats
(新聞, 仕事, 電車), the checklist has 69 items: 14 kanji, 47 further table words, 8 glossary entries.

## Coverage, item by item

**Carded in this unit (34 words):** 最後に, 不思議な, 電池, 作品, 答える, 仕返し, 火事, この間, 何人,
会員, 作者, 新聞, 目次, 言語学, 仕える, 車いす, 電子レンジ, 自転車, 読み物, 駅員, 休日, 新鮮な, 次回,
残業, 読書, 思い出す, 言葉, 返事, 電話, 店員, 次女, 聞こえる, 何時, 駐車場.

**Carded by an earlier unit (31):**

- The 14 kanji: 員, 作, 仕, 事, 言, 思 (chapter-9), 新, 休 (chapter-6), 聞, 読 (chapter-4), 電, 車, 次
  (chapter-7), 何 (chapter-8). 次 is a voiced word card (つぎ, "Next"), which is exactly what the
  table teaches. 事, 車 and 何 are silent character cards; see the finding below.
- 17 table words: 会社員, 作る, 仕事, 言う, 思う, 何か (chapter-9), 新しい, 休み (chapter-6), 聞く, 読む
  (chapter-4), 電車, 電気, 休む (chapter-7), 作文 (chapter-10), 新幹線 (chapter-11), 方言
  (chapter-12), 食事 (chapter-18). `reading-report.json` records each drop.

**Excluded or split with a sound reason (2):**

- 疲れている, excluded by the owner's words-only ruling (2026-10-13). Its dictionary form 疲れる "To
  get tired" is carded in chapter-12.
- 次に "secondly" is 次 plus a particle, and 次 is carded (chapter-7). Under reading rule 6 that is
  the right split. 最後に was kept whole with its に while 次に was split; both forms are defensible
  and I do not report the difference.

**Not carded (2):**

- ～の後: a pattern with a placeholder. The owner cut the same entry from chapter-22 on 2026-10-14,
  and 後 "After" is a character card from chapter-5. Not reported.
- 話 (はなし) "story; talk". The build generated it, then dropped it without a trace because
  chapter-4 already has a silent character card 話 under the same id. That card's English is "To
  speak", which is not this word's meaning, so the word is missing from the deck. Reported.

**Added by the deck (7):** 回, 葉, 鮮, 不, 品, 池, 駐. These are character-gap cards for kanji that
次回, 言葉, 新鮮な, 不思議な, 作品, 電池 and 駐車場 use before the book teaches them, with meaning and
readings from KANJIDIC2 and a reviewer's check (`reviewNote`). Every meaning is the character's own.
駐 has audio because it has one official reading (ちゅう), which the reading scheme voices by design.
In bounds.

## Faithful

Every shipping target is spelled as the table prints it, with the な kept on 不思議な and 新鮮な, the
kana kept in 車いす and 電子レンジ, and the okurigana kept in 仕返し, 読み物, 思い出す and 聞こえる. Each
English follows the book's gloss, down to "Artistic piece", "Station attendant", "Reading matter",
"To serve; to work under" and "Can be heard". The romaji fits every target (ten'in, chūshajō,
kyūjitsu, zangyō, nan-nin), and preflight is clean for the unit. The one exclusion is sound.

## Findings

**book-gap**

- (unit) 話 (はなし) "story; talk" from the report's glossary has no card; the only 話 card is
  chapter-4's silent character r-2f78e3a989f0 "To speak". should-fix.

**other**

- (unit) The table teaches 事 (こと, thing), 車 (くるま, car) and 何 (なに, what) as words with one
  reading each, but they stay silent character cards from earlier units (chapter-9 r-aae488416289,
  chapter-7 r-47782cc9bccb, chapter-8 r-4a9efaa77fc2). polish.
- r-d5bebe606b21 火事 "Fire" shares its whole answer with chapter-5's character 火 "Fire". polish.
- r-fdaff61a3b22 会員 "Member" shares its whole answer with chapter-9's character 員 "Member". polish.
- r-85b7df7c6919 休日 "Holiday" is wholly contained in chapter-6's 休み "Holiday; day off; absence",
  so the back of 休日 does not tell the two words apart. polish.

No book-mismatch, wrong-content, untaught-prerequisite or note-unverifiable findings. The cards
carry no notes.

## Counts

- Items the chapter teaches: 69 (14 kanji, 47 further table words, 8 glossary entries). The 3 kana
  glossary words are left to the kana deck.
- Items carded: 65 (34 here, 31 by earlier units), plus 2 sound exclusions or splits (疲れている,
  次に). ～の後 is accepted as an owner cut. 1 is not carded and reported (話).
- Cards checked: 41 shipping and 1 excluded.
- Cards with a finding: 3 (火事, 会員, 休日). There are also 2 unit-level findings.
