# Themes: Genki I reading deck, QA run 2026-10-15

Synthesized from `units/*.learner.md`, `units/*.reader.md` and `findings.jsonl` (115 findings: 64
CONFIRMED, 4 PLAUSIBLE, 47 REJECTED). The 68 non-rejected findings are 24 should-fix and 44 polish,
with no blocker. Every one of the 68 is assigned to exactly one theme below or to section 4, so the
theme counts add up to 68. Finding ids are quoted so each claim can be checked against the file.

Japanese in this file is given with its reading and English once per list, because the owner reads
romaji, not bare kana.

## 1. The deck in one paragraph

This is a deck a beginner can study. Across the 21 reviewed chapters (1,701 cards) the Learner used the
same words in almost every report: "studied well", "easy to study", "a payoff". The reason is
structural and the Learner named it every time: a chapter's single-kanji cards come before the words
built from them, so a compound the learner has never seen (週末 shūmatsu "weekend", 宇宙飛行士
uchūhikōshi "astronaut", 自動販売機 jidō hanbaiki "vending machine") can be read from parts already
held, and the back then confirms it. Readings that cannot be built from parts (今朝 kesa, 上手 jōzu,
一人 hitori, 大人 otona, 梅雨 tsuyu) are taught on the word's own back, which is exactly what a reading
card is for. Near pairs are told apart in the English where it matters: 暑い atsui "Hot (weather)"
against 熱い atsui "Hot (thing)", 開く hiraku "To open (a book)" against 開ける akeru "To open
(something)", 友人 yūjin "Friend (formal)" against 友だち tomodachi "Friend", しゅじん shujin "Husband"
against しゅうじん shūjin "Prisoner". Sets arrive whole: the months with their irregular readings, the
relative time grid (先週/今週/来週/再来週), the native counters 一つ to 九つ, the days of the month, the
four station exits, the kinship table. The later Reading and Writing chapters are the strongest
stretch of the deck because by then nearly every kanji has a card and each chapter is a payoff; the
Learner found nothing to file in Reading and Writing 11. Fronts never give anything away, no card
teaches anything false, and no card cannot be studied. What is wrong is almost all one thing, seen from
several sides: a single kanji the book teaches as a WORD ships as a silent character card, so the
word's reading and audio exist nowhere in the deck. That one mechanism accounts for 18 of the 68
findings and 9 of the 24 should-fixes.

## 2. Themes

Ranked by the number of CONFIRMED plus PLAUSIBLE findings each explains. Where two themes tie, the one
with more should-fix findings ranks higher.

### Theme 1. A single kanji the book teaches as a word ships as a silent character card

**18 findings (9 should-fix, 9 polish, 1 of them PLAUSIBLE), 12 chapters.**

The pattern. The character-gap step gives every kanji a word uses a card in the first chapter that
uses it, from KANJIDIC2, silent, graded on meaning alone. When a later chapter then teaches that same
kanji as a word in its own right (春 haru "spring", 海 umi "sea", 話 hanashi "story; talk", 本 hon
"book", 道 michi "way; road"), the reading phase generates the word card under the same id (ids are a
sha1 of the written form), and `dropCharactersCardedEarlier` in `src/reading/characterGaps.js`
removes it as a repeat of the earlier card, because it matches any single-kanji target already carded,
word or character. It returns the drop to its caller and writes nothing to `reading-report.json` or
`candidates/characters.json`, so no gate saw it. The result inverts rule 4 of
`docs/card-rules-reading.md` and the Japanese block in `src/reading/readingSchemes.js` ("a single kanji
the book also teaches as a word is ONE item: the word, with its reading, and it has audio"). Within one
chapter the word wins; across chapters nothing applies that rule. For the learner it means 本 "book" is
never heard, はる "spring" is never voiced, and 話 answers only "To speak" when the book has taught
"story; talk" twice. Where 水, 上, 下, 中, 人, 私, 川, 歌, 所, 色 and 昔 show the intended outcome (voiced
word cards), 27 other single kanji did not get it.

The 27 kanji, by the finding that names them: 時 toki (`chapter-5/-/book-gap/1`), 海 umi
(`chapter-6/-/book-gap/1`), 袋 fukuro (`chapter-9/r-cc98544dbc8a/book-mismatch/1`, a character-gap card
made for a cut phrase whose exclusion says the word is carded), 春 haru and 秋 aki
(`chapter-11/-/book-gap/1`, `/2`), 年 nen "... years" and 後 go "in ... time" (`chapter-11/-/book-gap/3`,
`/4`), 月 tsuki, 火 hi, 木 ki, 土 tsuchi, 本 hon (`chapter-17/-/other/1`), 今 ima and 山 yama
(`chapter-18/-/other/2`), 話 hanashi (`chapter-21/-/book-gap/1` and again `chapter-22/-/book-gap/1`, one
card, two findings), 事 koto, 車 kuruma, 何 nani (`chapter-21/-/other/1`), 白 shiro and 昼 hiru
(`chapter-22/-/other/1`), 道 michi (`chapter-7/r-a33670427c5d/book-mismatch/1`), 年 toshi
(`chapter-5/r-6f14c2641c25/book-mismatch/1`), 手 te and 紙 kami (`chapter-24/-/other/1`), 牛 ushi, 赤
aka, 青 ao, 天 ten (`chapter-25/-/other/1`), and 赤 aka again as a PLAUSIBLE owner question
(`chapter-10/r-72776ab68f81/book-mismatch/1`: Lesson 9 says the colour adjectives "become nouns
without the い", which also covers 黒 kuro, 青 ao and 白 shiro).

The attack. Three parts, in this order.

1. Fix the mechanism in `src/reading/characterGaps.js` (`dropCharactersCardedEarlier`, around lines
   237 to 250): when the item being dropped has `ttsText` (it is a word), do not drop it; instead
   rewrite the earlier unit's card in place as the word (same id, so the delivered note updates rather
   than migrates): `ttsText` and `pronunciation` from the book's reading, `english` from the book,
   `reviewNote` saying which chapter taught it, and update that unit's `candidates/characters.json` so
   the book pass does not turn it back into a kanji card. Log every drop, word or character, to
   `reading-report.json`. Design home: `docs/designs/reading-decks/10-character-cards.md` (the hoisting
   design, which never said what happens when the hoisted kanji is later taught as a word) and
   `05-japanese-plugin.md`.
2. Add a preflight tier in `src/audit/checks/reading.js`: a single-kanji card with no `ttsText` whose
   target appears as `kind: "word"` in any unit's `candidates/tables.json` or `as-generated.json` is a
   finding. This is the check that would have caught all 18.
3. Sweep the 27 kanji above by hand (the affected units are `meta.done`, so the fix lands on
   chapter-4, -5, -6, -7, -8, -9 and -10 cards in place), then the audio gate for the new clips. Two
   branches need the owner: a kanji with two live readings (年 nen/toshi, 後 go/ato; the Verifier
   argued these should stay silent and carry both senses in the English), and whether a noun the book
   teaches by rule rather than by a vocabulary line (赤, 青, 黒, 白 as colour nouns) counts as teaching
   the word. One ruling settles each branch; record them in `DECISIONS.md`.

### Theme 2. The English is faithful to the book but inconsistent with its neighbours

**9 findings (0 should-fix, 9 polish), 4 chapters.**

The pattern. A card copies the book's gloss and is right, but the cards next to it, from the same
table or the same pattern, were glossed with a qualifier this one lacks, so on the shuffle the learner
gets a different answer shape for the same kind of card. The book marks 何も nanimo and 別に betsuni
identically with "+ negative"; the deck kept the marker on 何も and dropped it from 別に
(`chapter-8/r-715a30074c48/missing-info/1`) and from 全然 zenzen
(`chapter-4/r-4a2f5c2aed74/missing-info/1`). The kinship table spans one cell for 弟 otōto and 妹 imōto
under "Referring to yours", and the deck glossed 兄 and 姉 "(My) ..." but 弟 and 妹 bare
(`chapter-8/r-276330ed9702/missing-info/1`, `chapter-8/r-28f894973975/missing-info/1`), うちの人 uchi no
hito "Husband (informal)" without the "My" that うちの子 and 主人 carry
(`chapter-8/r-ffb5060bdee1/missing-info/1`), and うちの子 uchi no ko tagged "(informal)" when the book's
cell spans formal and informal (`chapter-8/r-25e914fe05f6/book-mismatch/1`). 始まる hajimaru got
"(Something) begins" and its partner 終わる owaru got "To end"
(`chapter-10/r-b9a0bbca64df/book-mismatch/1`). 青信号 aoshingō "Green light" sits beside 青 "Blue" with
nothing bridging them (`chapter-10/r-244232298a54/missing-info/1`). では、お元気で "Take care." keeps a
full stop that 30 of 32 greetings do not (`chapter-18/r-31825d8efb50/other/1`).

The attack. This is a sweep, not a code change, with one rule to write down. The rule: when the book
marks an entry ("+ negative", "(something)", a table cell that says whose family), every card from
that table carries the marker the same way, and `docs/card-rules-reading.md` rule 9's bracket style
is the form. Put one sentence to that effect in rule 9 and in the reading chapter reader prompt (the
pass logged as `02-readingChapterReader`), where the glosses are written. For the full stop, the strip
that removes the book's trailing 。 from greetings should also strip the English's trailing stop; a
one-line preflight check ("english ends with a full stop") would hold it. Then sweep: the chapter-8
kinship set as one edit (弟, 妹, うちの人, うちの子, and 奥さん from Theme 3, worded together so
they stay distinct), the two "+ negative" words, 終わる, 青信号, and the two greetings with stops
(では、お元気で and お大事に odaijini in chapter-13, which the Reader noted but did not file).

### Theme 3. A second meaning the book teaches never reaches the one card for that written form

**7 findings (3 should-fix, 4 polish), 6 chapters.**

The pattern. Rule 3 says one written form is one card whose English carries every meaning the book
teaches for it. The build honours that within a chapter and loses it across chapters: when a later
chapter teaches a new sense for a form already carded, the item is dropped as "already carded in
Chapter X" and its English is discarded with it. 聞く kiku "to ask" (Lesson 5) never joins Lesson 3's
"To listen; to hear" (`chapter-6/-/book-gap/2`). 度 do "time (occurrence)" from the R&W 10 table never
joins Lesson 8's "Degrees (temperature)" (`chapter-9/r-304fce687a69/book-mismatch/1`), which is also
why a learner reading 一度 ichido as "one degree" has no card to correct them. 前 mae "before" never
joins Lesson 4's "Front" (`chapter-22/-/book-mismatch/1`). 三日 mikka ships as "Three days" from R&W 4
while R&W 5 teaches it as the 3rd of the month and cards every other date that way; the Learner, who
answered "the 3rd" and was marked wrong, and the Reader filed it from each side
(`chapter-17/r-482dccb7367c/unanswerable/1`, `chapter-17/r-482dccb7367c/book-gap/1`). お茶 ocha "tea
ceremony" from the Lesson 9 culture note never joins Lesson 3's "Green tea"
(`chapter-10/-/book-gap/2`). 奥さん okusan is glossed as someone else's wife only, though the kinship
table also lists it for one's own, informally (`chapter-8/r-8dfa494661bc/book-mismatch/1`).

The attack. Fix the drop path, not the cards one by one. Where the reading phase drops an item as
already carded (the cross-unit dedup in `src/reading/readingPhase.js` that writes the `dropped` list in
`reading-report.json`), compare the new item's English with the earlier card's: if the new English
adds a sense (is not contained in the old one), either merge it into the earlier card in place or
write a review-gate line that names both. A preflight tier can catch what has already shipped: for
every `dropped as already carded` entry in any unit's `reading-report.json`, check that the earlier
card's English contains the dropped item's English. Then sweep the six cards. 三日 is the one that
marks a right answer wrong and should go first.

### Theme 4. Romaji style slips the lint cannot see

**6 findings (0 should-fix, 6 polish), 6 chapters.**

The pattern. The house style in `src/translate/romajiStyle.js` is clear and the deck mostly follows
it, but four kinds of slip get through because the lint does not look where they happen. The book's
placeholder tilde, stripped from `target` and `ttsText` by `reconcileReading`, was reintroduced into
`pronunciation` by the romaji-correction pass (`candidates/romanization.json`): 時間 "~jikan"
(`chapter-5/r-09558b2cc685/wrong-content/1`), 代 "~dai" (`chapter-13/r-b5a9258cf7d9/wrong-content/1`),
and five suffix cards with a full-width 〜 (方面 hōmen, 番線 bansen, 週間 shūkan, 行き iki, か月 kagetsu;
`chapter-11/-/other/1`), while chapter-12's 点 ten and 行目 gyōme drop it. A counter without a hyphen:
五分 "gofun" where the same unit writes 十分 "jup-pun" (`chapter-19/r-8090dd787fc2/other/1`), missed
because `fun`/`pun` are not in `JA_SAFE_COUNTER`. A four-kanji compound fused where 15 of the deck's 19
split at the word boundary: 宇宙飛行士 "uchūhikōshi" (`chapter-12/r-8baf85e00cb0/other/1`). And the one
n-apostrophe before w in the collection, ゴールデンウィーク "gōruden'wīku"
(`chapter-26/r-36cbc6b98422/wrong-content/1`), where the rule puts the apostrophe only before a vowel
or y.

The attack. All in `src/translate/romajiStyle.js` and the check that runs it: add a lint that
`pronunciation` contains neither `~` nor `〜` (the placeholder-target check in
`src/audit/checks/collection.js` reads `target` only; extend it to `pronunciation`); add `fun|pun` to
`JA_SAFE_COUNTER`; add the n-apostrophe rule's exact condition (before a vowel or y, never before w) to
the lint; and for compounds of four or more kanji, have the romanization pass split at the morpheme
boundary as the style spec's word-segmentation rule already asks. Then rerun the lint over the
collection: the Verifier noted the kana deck writes its five minute counts fused (ippun, kyūfun,
jūkyūfun, jūroppun, jūyonpun), which the same sweep should settle one way.

### Theme 5. An exclusion reason promises a card that does not exist at this chapter

**5 findings (4 should-fix, 1 polish), 4 chapters.**

The pattern. The words-only cut (commit baaab52) excluded phrases with the reason "Its words are
carded on their own: X, Y" without checking that X and Y had a card in this unit or an earlier one.
Where the word is carded chapters later, the learner cannot read a vocabulary-table word for most of
the book: 高い takai is promised at Lesson 7 (背が高い se ga takai "tall") and first ships in R&W 7,
while its partner 低い hikui ships here (`chapter-8/r-f27a36c8d505/book-gap/1`); 人気 ninki is promised
at Lesson 9 (人気がある "to be popular") and ships in R&W 5, eight chapters on
(`chapter-10/r-c54e6deec071/book-gap/1`); 出す dasu "to hand in" is promised at Lesson 11 and ships in
R&W 6 in another sense (`chapter-12/-/book-gap/1`); 右側 migigawa is promised at Lesson 6, where its
pair 左側 hidarigawa was added, and ships in R&W 6 (`chapter-7/-/book-gap/2`). And where the cut listed
some of a phrase's words but not all, the rest fell through: 一つ目 hitotsume and 二つ目 futatsume from
the directions list have no card at all (`chapter-7/-/book-gap/1`).

The attack. A check first, then the moves. The check: parse every `excludedReason` of the form
"carded on their own: ..." and verify each listed word has a shipping card in this unit or an earlier
one in study order (`scripts/qa-ledger.mjs` already knows the order); make it a preflight tier in
`src/audit/checks/reading.js`. The moves are owner steps, because rule 3 holds one card per written
form across the collection and the later cards (高い r-e9d57f21b007, 人気 r-8c824404672f, 出す
r-94c7b5d5e878, 右側 r-ed9d988c2f60) are all in `anki-delivered.json` with Anki GUIDs: moving a card to
the lesson that teaches it is a scheduling-aware migration of a note the owner studies, not an edit.
The English of the moved card should then cover the senses the book has taught by that chapter (高い
"Tall; high; expensive"; 出す "To hand in; to take out"). 一つ目 and 二つ目 are plain additions.

### Theme 6. Two single-character cards share an answer, and preflight cannot see it

**5 findings (1 should-fix, 4 polish), 3 chapters.**

The pattern. Rule 9 says two characters never share an English answer. The
`reading-distinct-english` check compares exact lowercased strings, so it passes 踊 "Dance" against
舞 "Dance; flutter" (`chapter-10/r-619113f21dd1/other/1`), 販 "Sell" against 売 "To sell"
(`chapter-23/r-2ea8aba2d5fc/other/1`), 移 "Move" against 動 "Move; change"
(`chapter-23/r-c59a75dc9cf3/other/1`), 華 "Flower; splendor" against 花 "Flower"
(`chapter-10/r-b7f5f9032c7e/other/1`), and 才 "Genius; years old" against 天才 "Genius" in the same
unit (`chapter-18/r-b27790d8cdf7/other/1`). In three of the five the character review itself caused
it, by trimming a distinguishing sense: `candidates/characters.json` records "dropped 'trade' as an
unneeded second sense" for 販 and collapsed 移 from "Shift; move; change" to "Move".

The attack. Two changes. In the check (`src/audit/checks/reading.js`, `readingDistinctEnglishCheck`):
for character cards, also flag an answer whose head sense (the text before the first `;`) equals
another character card's head sense, or whose whole answer is contained in another's. In the
character review (`CHARACTER_REVIEW_VERSION` in `src/reading/characterGaps.js`): when trimming a
KANJIDIC2 entry to one or two senses, check the result against every earlier character card's English
and keep the sense that tells them apart. Then fix the five, updating `candidates/characters.json` so
a re-run does not undo it. Suggested glosses are in the verdicts (踊 "Dance; jump", 販 "Sell; trade",
移 "Shift; move (to another place)", 華 "Splendor; flower (literary)", 才 "Talent; years old").

### Theme 7. A character card carries the meaning of the word it was generated for

**4 findings (2 should-fix, 2 polish), 3 chapters.**

The pattern. Rule 9 says a character's English is what the character means, never the meaning of a
word it appears in, and the character review prompt says the same. Four cards break it, and in each
the reviewNote cites KANJIDIC2 while the gloss is not in KANJIDIC2: 味 "Meaning; taste" (KANJIDIC2:
flavor, taste; "Meaning" is 意味 imi, carded in the same unit;
`chapter-12/r-df96a6e9ec65/wrong-content/1`), 宇 "Universe" (KANJIDIC2: eaves, roof, house, heaven;
"Universe" is 宇宙 uchū; `chapter-12/r-1832f9e9d247/wrong-content/1`), 刺 "Business card; stab"
(KANJIDIC2 lists calling card last; the review note says it was "led by the sense 名刺 uses";
`chapter-22/r-97cd3b2ec4e3/wrong-content/1`), and 弁 "Speech; dialect; boxed lunch" ("boxed lunch" is
お弁当 obentō; `chapter-10/r-c12a2fd19822/other/1`). 味 and 刺 teach a sense the character does not
have, which is why they are should-fix.

The attack. This is checkable without a model: a character card's English contains a sense that is
neither in its KANJIDIC2 entry (`src/reading/data/kanjidic2-compact.json`) nor in the book's kanji
table for it, or its head sense equals the English of a word in the same unit that contains the
kanji. Add that as a preflight tier, or as a hard check inside the character review step so the
reviewer's output is validated against its own cited source before it is written. Then fix the four,
and the `candidates/characters.json` entries behind them.

### Theme 8. The kana deck keeps the first entry for a repeated form and loses the rest

**3 findings (1 should-fix, 2 polish), 1 chapter.**

The pattern. Every chapter's kana-only words go into a pool, and `src/reading/soundDeck.js` dedups the
pool with `seen.has(entry.target)`, keeping the first entry in book order and silently dropping every
later one's English. So さん san ships as "Three" and the "Mr./Ms." sense from Lesson 1 is gone
(`chapter-26/r-0d0fd2531ac7/book-mismatch/1`, should-fix because the title follows a proper name on
almost every page and the learner has to read it alone); ご go ships as "Five" and loses "...
language" (`chapter-26/r-27a87259d93f/book-mismatch/1`); and きれい kirei was taken bare because it
came first, and きれいな kirei na was then dropped as "budget full", leaving the one な-adjective in
the kana deck without its な (`chapter-26/r-2b8c515b4475/book-mismatch/1`). The Learner saw the last one
from the other side: without な it files with the い-adjectives.

The attack. In `soundDeck.js`, merge instead of skip: when a pool entry's target is already seen,
union its English into the kept entry (rule 3, "Today; this day"), and when the pool holds a bare form
and its な form, prefer the fuller form before the budget is applied (rule 2). Write the merge rule
into `docs/designs/reading-decks/09-kana-deck.md`. The three cards are then a rebuild of the kana
unit, or three edits by hand (きれい becomes a target change and so new audio).

### Theme 9. Countries excluded as proper names, against the shared rule

**2 findings (2 should-fix), 1 chapter.**

The pattern. The R&W 4 kanji table teaches 日本 nihon "Japan" and 中国 chūgoku "China" with their
readings, and the chapter reader excluded both as "proper names (countries)"
(`chapter-17/-/book-gap/1`, `/2`). `docs/card-rules-shared.md` says countries, cities and districts
are ordinary vocabulary (owner ruling 2026-09-22), and `04-card-rules.md` makes reading rule 7 the
same rule the speaking decks follow, so the exclusion contradicts the rule it cites. The kana deck
already ships にほん and ちゅうごく plus ten other country names, and this unit cards 日本語 and 日本人.

The attack. The reading prompts receive `docs/card-rules-reading.md`, not `card-rules-shared.md`, so
rule 7 there says only "people, places, companies, named facilities" and leaves "places" open. Copy
the countries sentence into reading rule 7 so the rule travels with the prompts that need it (the
failure mode CLAUDE.md golden rule 5 describes). Then add the two word cards here; the kana cards stay
(one word in two spellings keeps one answer, rule 9).

### Theme 10. A word with two book readings shows one, and nobody has ruled on it

**2 findings (both PLAUSIBLE, polish), 2 chapters.**

The pattern. 七人 shichinin/nananin (`chapter-8/r-e9d3dae7d71d/book-mismatch/1`) and 毎年
mainen/maitoshi (`chapter-20/r-4d564a3bda7f/book-mismatch/1`) show one reading on the back while the
book prints two. This is not a slip on those cards: six cards carry the identical reviewNote "The book
gives more than one reading: X, Y. Audio uses the first." (十歳 jussai/jissai, 十分 juppun/jippun, 毎年,
男の人 otoko no hito, 女の人 onna no hito, 七人), `04-card-rules.md` says the romaji is made from the
word's reading, singular, and no word card anywhere shows two readings.

The attack. One owner ruling: may a word card's Says line list the book's alternative readings
("shichi-nin / nana-nin") when the audio voices the first? If yes, apply to all six and write it into
`docs/designs/reading-decks/04-card-rules.md` and the build-reading-deck SKILL.md; if no, flip both
findings to `wont-fix` and record the ruling in `DECISIONS.md` so the next run does not raise it.

## 3. Chapter table

Chapters in book order, which is the study order. Findings are total (CONFIRMED / PLAUSIBLE /
REJECTED); should-fix and polish count the non-rejected findings only. Six units ship no cards and
were not reviewed (Greetings, Numbers, Lessons 1 and 2, R&W 1 and 2).

| Unit       | Book chapter |     Cards | Findings (C/P/R)  | Should-fix | Polish | Strongest                                                                                   | Weakest                                                                              |
| ---------- | ------------ | --------: | ----------------- | ---------: | -----: | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| chapter-26 | 00 Kana      |       299 | 8 (6/0/2)         |          1 |      5 | Near pairs told apart (しゅじん/しゅうじん); polite and plain greetings marked              | Pool dedup keeps the first English: さん is "Three" only                             |
| chapter-4  | 05 Lesson 3  |        83 | 4 (2/0/2)         |          0 |      2 | Kanji kun stems line up with the verb cards; 呂 glossed honestly                            | 々 unexplained until the last unit; 全然 lost "+ negative"                           |
| chapter-5  | 06 Lesson 4  |       161 | 8 (4/0/4)         |          1 |      3 | Month series and relative-time grid complete; holidays decompose into the unit's own kanji  | 時 toki "when" dropped as a character repeat; six exercise-only words need a ruling  |
| chapter-6  | 07 Lesson 5  |        66 | 2 (2/0/0)         |          2 |      0 | 暑い/熱い and 暑/熱 told apart; like/dislike family                                         | 海 umi and 聞く "to ask" never reach a card                                          |
| chapter-7  | 08 Lesson 6  |        97 | 8 (3/1/4)         |          2 |      2 | Kanji and verb pairs support each other; 連れてくる against 持ってくる                      | Directions-list words fell through the cut (右側, 一つ目, 二つ目); 道 silent         |
| chapter-8  | 09 Lesson 7  |        99 | 8 (7/1/0)         |          1 |      7 | The my/someone else's family split is mostly visible on the back; irregular readings taught | Kinship glosses inconsistent ((My), informal tags); 高い not carded until R&W 7      |
| chapter-9  | 10 Lesson 8  |        82 | 2 (2/0/0)         |          1 |      1 | Single-kanji words voiced (冬, 夏, 雪, 雨); 事/物 and 鶏/鶏肉 apart                         | 袋 fukuro is a silent KANJIDIC card; 度 lacks the "time" sense                       |
| chapter-10 | 11 Lesson 9  |        93 | 11 (8/1/2)        |          2 |      7 | Colour family reads from its parts; counters 一つ to 九つ fully supported                   | Most findings of any chapter: 生け花 and 人気 missing, 踊/舞 and 華/花 collide       |
| chapter-11 | 12 Lesson 10 |       112 | 6 (5/0/1)         |          2 |      3 | Temperature set kept apart; 早く/速く; railway words readable from earlier kanji            | 春 and 秋 word cards dropped silently; 〜 in five romaji lines                       |
| chapter-12 | 13 Lesson 11 |       116 | 5 (4/0/1)         |          2 |      2 | Verb pairs distinct (開く/開ける, 取る/撮る); job-suffix kanji make the jobs readable       | 味 "Meaning" and 宇 "Universe"; 出す missing                                         |
| chapter-13 | 14 Lesson 12 |       100 | 9 (1/0/8)         |          0 |      1 | Every new kanji put to work in the same unit; opposite pairs together                       | Nothing real: 8 Learner findings rejected (whole-word readings); one tilde in romaji |
| chapter-16 | 17 R&W 3     |        39 | 2 (0/0/2)         |          0 |      0 | Sound-changed numbers each carry their reading (rop-pyaku, has-sen, jus-sai)                | Nothing confirmed                                                                    |
| chapter-17 | 18 R&W 4     |        29 | 8 (5/0/3)         |          5 |      0 | 半 family reads cleanly; new kanji pay off in the same chapter                              | Highest should-fix count: 三日 one sense, 日本/中国 excluded, 月火木土本 silent      |
| chapter-18 | 19 R&W 5     |        36 | 6 (4/0/2)         |          1 |      3 | Days of the month read from the number kanji's kun readings; formal/plain pairs marked      | 様 sama missing; 今/山 silent; 才 against 天才                                       |
| chapter-19 | 20 R&W 6     |        41 | 3 (1/0/2)         |          0 |      1 | Station exits form one set; left/right compounds read from parts                            | 五分 "gofun" without the counter hyphen                                              |
| chapter-20 | 21 R&W 7     |        30 | 5 (0/1/4)         |          0 |      1 | Each new kanji arrives with a compound that anchors it                                      | 毎年 shows one of two readings (owner convention)                                    |
| chapter-21 | 22 R&W 8     |        41 | 5 (2/0/3)         |          1 |      1 | 員 words pay off; 次女 next to 長女                                                         | 話 hanashi carded nowhere; 事/車/何 silent                                           |
| chapter-22 | 23 R&W 9     |        43 | 5 (4/0/1)         |          2 |      2 | Near-synonyms glossed apart (友人/友だち, 梅雨/雨期, 少々/少し)                             | 刺 "Business card"; 話 again; 白/昼 silent                                           |
| chapter-23 | 24 R&W 10    |        26 | 4 (2/0/2)         |          1 |      1 | New characters come back at once (販 in 自動販売機, 解 in 正解)                             | 販/売 and 移/動 share answers                                                        |
| chapter-24 | 25 R&W 11    |        56 | 3 (1/0/2)         |          0 |      1 | A payoff chapter; the Learner found nothing to file                                         | 手/紙 silent                                                                         |
| chapter-25 | 26 R&W 12    |        52 | 3 (1/0/2)         |          0 |      1 | The 々 card explains a mark read since Lesson 3; new kanji anchored                         | 牛/赤/青/天 silent                                                                   |
| **Total**  | 21 chapters  | **1,701** | **115 (64/4/47)** |     **24** | **44** |                                                                                             |                                                                                      |

## 4. Single items worth doing first

The seven non-rejected findings that belong to no theme, should-fix first.

1. `chapter-10/-/book-gap/1` (should-fix). 生け花 ikebana "flower arrangement", the culture note's main
   name, has no card anywhere; only the bracketed 華道 kadō is carded. Add it, and tell the two apart
   in the English. 生 and 花 are both carded already, so no character card is needed.
2. `chapter-18/-/book-gap/1` (should-fix). 様 sama "Mr./Ms. (in letters)" is taught in the R&W 5
   postcard glossary with its kanji, and neither 様 nor さま has a card; the pool sent さま to the kana
   budget, which did not pick it. Card the kanji form here, as rule 2 says.
3. `chapter-26/r-1cd72882c51d/book-mismatch/1` (polish). あげる ageru is glossed "To give; to raise (a
   hand)"; the only あげる in Genki I is 手をあげてください "raise your hand", and "to give" is Genki II.
   Make it "To raise (a hand)".
4. `chapter-26/r-f76f81e7a0e6/book-mismatch/1` (polish). たんじょうびおめでとう drops the bracketed お
   the book prints, while every other bracketed greeting part was kept (おやすみなさい,
   ごちそうさまでした). Change the target to おたんじょうびおめでとう; new audio.
5. `chapter-4/r-44bf896f470f/missing-info/1` (polish). The repetition mark 々 is met in 時々 tokidoki
   at Lesson 3 and explained only by the 々 card in the last unit (chapter-25). The hoisting design
   skips it because `charactersIn` filters out anything KANJIDIC2 lacks. Move or copy the 々 card to
   chapter-4.
6. `chapter-5/-/other/1` (polish, owner decision). Six Lesson 4 word cards (銀行 ginkō, 郵便局
   yūbinkyoku, 図書館 toshokan, 大学 daigaku, 高校 kōkō, 魚 sakana) come only from grammar examples, exercise
   maps and a picture label, which rule 1 excludes, and bring eight character cards with them. Either
   write the exception (first kanji spelling of a word taught earlier in kana) into
   `docs/card-rules-reading.md` or exclude them. The cards themselves are correct.
7. `chapter-7/-/book-gap/4` (PLAUSIBLE, polish, owner decision). The Lesson 6 culture-note school
   diagram is half carded (大学院, 短期大学, 保育園, 幼稚園, 小学校, 中学校, 高等学校) and half not (短大,
   義務教育, 夏休み, 冬休み, 春休み). Rule 1 says nothing about culture notes. One ruling on
   culture-note labels settles this and the お茶 item in Theme 3.

Two notes for the fixer that are not findings. 話 (Theme 1) and 赤 (Theme 1) and 三日 (Theme 3) each
carry two findings for one card; fix once and flip both ids. Five findings were filed by both roles
under one id and merged by the Verifier (`source: learner+reader`); they count once above.

## 5. What was rejected, and why it kept coming up

47 findings were rejected: 26 from the Learner, 17 from the Reader, 4 filed by both. Six causes
account for all of them, and the first three are prompt problems the next run can remove.

**A. "The reading cannot be built from the kanji cards, and the back does not say it is a whole-word
reading" (12 rejections, all Learner).** 今日 kyō, 明日 ashita (chapter-4), 今年 kotoshi, 昨日 kinō
(chapter-5), 相撲 sumō, 歌舞伎 kabuki (chapter-10), 下痢 geri, 歯科 shika, 二日酔い futsukayoi, 風邪 kaze,
彼女 kanojo (chapter-13), and 円 en lacking "maru" (chapter-16). Each asked for a note, a marker, or an
extra reading on a kanji card. All were rejected for the same two reasons: a reading card has no note,
hint or pronunciation field by design (`docs/card-rules-reading.md`; the template renders Target,
Answer, Says and audio only), and the design settled on 2026-09-28 that a silent kanji card is graded
on meaning alone with its readings as a reference, the word's reading being learned from the word
card. Where the kanji is itself a word card (下 shita, 歯 ha, 彼 kare, 歌 uta, 円 en), its Says line is
the word's reading, not the kanji's list, by rule 4. **For the next run's Learner prompt:** say that a
reading card has no note field and that a compound's reading is taught by the compound's own back, so
"I could not build this reading from the kanji cards" is the deck working as designed and is not a
finding unless the back's reading is wrong. This one sentence would have removed nearly half the
Learner's rejections and all eight in chapter-13.

**B. "The same word carded twice, with and without な, or in two spellings" (8 rejections, Learner and
Reader).** 上手な/上手, 下手な/下手 (chapter-17, filed twice), 大変な/大変 (chapter-19), 有名な/有名
(chapter-22), 好きな/好き, 大好きな/大好き (chapter-24), 入り口/入口 (chapter-19). Rule 3 dedups by written
form, not by lemma; each card is the form its own lesson prints; and the owner reviewed exactly this
pattern on 2026-10-14 and kept 有名/有名な and 静か/しずかな (`.preflight-accepted.json`). **For both
prompts:** a word in two written forms the book prints is two cards by design, and the owner has ruled
on the な pairs; do not file them.

**C. "A kanji card and a word card share an English answer" (7 rejections, mostly Reader).** 文字/字,
子ども/子, 帰り/帰 (chapter-20), 火事/火, 会員/員, 休日/休み (chapter-21), 戸/ドア (chapter-23). Rule 9
forbids two WORDS or two CHARACTERS sharing an answer; `reading-distinct-english` compares kanji cards
with kanji cards and words with words by owner decision (2026-10-14), because a kanji's own meaning is
naturally shared by the word built on it, and 61 such pairs ship. 休日/休み was not even a shared
answer. **For the Reader prompt:** state the kanji-versus-word carve-out in the rule 9 paragraph, and
that a containment of sense is not a shared answer unless both cards are the same kind (which is the
case Theme 6 does want filed).

**D. "The card is faithful to the book, but the gloss looks narrow or odd" (10 rejections, mostly
Learner).** スポーツの日 "Health and Sports Day", 先 "Ahead" (chapter-5), 曲がる "To turn" (chapter-7),
暖かい plain "Warm" (chapter-11), 内科 "Physician" (chapter-13), 一日 tsuitachi, the N日 dates as dates
only (chapter-18), 入社 "Entry to a company" (chapter-20), 移住する "To immigrate" (chapter-23), 一度
"Once" only (chapter-25). `qa/README.md` already says a finding never says the book is wrong, and a
faithful card whose gloss looks odd is not a finding. The Learner cannot know a gloss is the book's,
so these will recur unless the Learner prompt says that a gloss that is merely narrower than the
learner expected is not a finding when nothing in the deck collides with it; the test is whether a
right answer gets marked wrong (as with 三日, which was confirmed).

**E. "Not taught here, by rule 1" (6 rejections, Reader).** せき "seat" from a pronunciation drill
(chapter-26), 保険証/痛み止め/食後 from a dialogue, 台風/梅雨 from culture-note prose (chapter-13), 同じ
carded where Lesson 12's table puts it (chapter-12), 子ども already known as 子供 (chapter-16), and
すぐ/つける/どうも left to the kana budget (chapter-7). The last one is worth a tooling note: the
drop reason "carded in the collection's kana deck" over-states "offered to the kana pool", and the
Reader took it at its word. Fix the string in the reading report.

**F. Already in `.preflight-accepted.json` (3 rejections)** (LLサイズ/XLサイズ, 高等学校/高校,
中学校/中学), **and one format question** (差 "sa / sa", which is correct data under the deck's kun-stem
convention). The pilot had already told the Reader to check preflight's accepted list; two of these
three slipped through anyway, so the Reader prompt should name the file path.

A last pattern that runs through the rejections and the confirmations alike: the Learner's "fix" asked
for a note on the card in 10 of its 37 findings, and a reading card cannot carry one. When the Learner
is right about the problem (三日, 全然, 青信号, 才), the Verifier had to translate the fix into an
English change.
Telling the Learner up front that the only levers on a reading card are the target, the English and
the romaji would make its fixes land as written.

---

Path: `qa/genki-an-integrated-course-in-elementary-japanese-i-third-ed-reading/2026-10-15/themes.md`.
Themes: 10.
