# Reader: chapter-25 (Chapter 26: Reading and Writing 12: Tanabata Festival)

Collection: genki-an-integrated-course-in-elementary-japanese-i-third-ed-reading. One unit, no extras.

Source: `chapter-outline.mjs af43edd86648b83e 26`, read to the END OF CHAPTER line. I opened all 16
images: 14 are crops of the kanji table (page-361 fig-1 to fig-8, page-362 fig-1 to fig-6; fig-8 is
blank), one is the tanzaku drawing (page-363 fig-1: ひこぼし, 天の川, ドラえもんに会いたい) and one is
the Orihime and Hikoboshi drawing (page-365 fig-1, no words). Every word in them is also in the
outline text. There is no `image-verdicts.json`; I also read `reading-report.json`,
`as-generated.json`, `candidates/characters.json` and the coverage log.

## What the chapter teaches

**Kanji 132 to 145, as characters** (meaning and readings): 昔 ancient times, 々 symbol of repetition
of a kanji, 神 God, 早 early, 起 to get up, 牛 cow, 使 to use, 働 to work, 連 to link, 別 to separate,
度 time; degrees, 赤 red, 青 blue, 色 color. The table also prints 昔 (むかし), 牛 (うし), 赤 (あか),
青 (あお) and 色 (いろ) as words with one reading, so each of those five is one item: the word.

**The kanji table's example words**: 昔話, 大昔; 昔々, 人々, 時々, 色々な; 神さま, 神社, 神道, 神戸市;
早い, 早起きする, 早朝; 起きる, 起こす, 再起動; 牛乳, 牛肉, 子牛; 使う, 大使, 使用中, お使い; 働く,
共働き, 労働; 連れて帰る, 国連, 連休; 別れる, 別に, 特別な, 差別, 別々に; 一度, 今度, 温度, 三十度,
態度; 赤い, 赤ちゃん, 赤道, 赤十字; 青い, 青年, 青空, 青信号; 景色, 特色.

**The reading's vocabulary list** (new beyond the table): 天 (てん) the heavens; the sky, 怒る, 娘,
泣く, まじめ(な), かわいそう(な), はたを織る, 一年に一度, ある〜, 〜までに, 大人, 願い, 見つける, かなう,
天の川, 私たち, 向こう, 〜など, たんざく, 畑. (神さま, 連れて帰る, 牛 and 人々 repeat table entries.)

No grammar point is taught as such; ある〜, 〜までに and 〜など are glossed fragments, and a reading
deck cards none of them. The exercises (I.A to C, II.C, III) and the story add no glossed word.

## Coverage verdict

| Item                                                                                                                           | Card                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 昔 (word), 々                                                                                                                  | r-cccfb185278a (voiced), r-2af09592503a (silent), here                                                    |
| 昔話, 大昔, 昔々, 人々, 色々な, 神さま, 神道, 早起きする, 早朝, 起こす, 再起動, 子牛, 大使, 使用中, お使い, 共働き, 労働, 連休 | here                                                                                                      |
| 特別な, 差別, 別々に, 一度, 温度, 三十度, 態度, 赤ちゃん, 赤道, 青年, 青空, 景色, 特色                                         | here                                                                                                      |
| 怒る, 娘, 泣く, 願い, 見つける, 天の川, 私たち, 向こう, 畑                                                                     | here                                                                                                      |
| はたを織る                                                                                                                     | excluded (phrase, sound reason); 織る r-ca3d67737989 here, はた in the kana deck (chapter-26)             |
| 連れて帰る                                                                                                                     | excluded (phrase, sound reason); 連れる r-29bd54e8b6f1 here, 帰る chapter-4 r-3a9f9a5edc18                |
| 神, 早, 起, 使, 働, 連, 別 (characters)                                                                                        | character cards in chapters 4, 7, 8 and 12, meanings and readings matching this table                     |
| 度 (character)                                                                                                                 | chapter-9 word card r-304fce687a69 "Degrees (temperature)": the "time" sense is missing (finding)         |
| 色 (word)                                                                                                                      | chapter-10 r-1391f4a4c627, voiced いろ                                                                    |
| 牛, 赤, 青 (words), 天 (word)                                                                                                  | silent character cards in chapters 9, 10 and 5 (finding)                                                  |
| 時々, 神社, 早い, 起きる, 牛乳, 牛肉, 使う, 働く, 別れる, 別に, 今度, 赤い, 青い, 青信号, 大人                                 | carded in earlier units (reading-report drops)                                                            |
| 一年に一度                                                                                                                     | phrase; 一度 carded here. 一年 has no reading anywhere in the chapter, so the language rules leave it out |
| 神戸市, 国連, 赤十字                                                                                                           | proper names (a city, two organisations), correctly left out                                              |
| まじめ(な), かわいそう(な), かなう, たんざく, ある〜, 〜までに, 〜など                                                         | kana-only, sent to the kana pool and not chosen by its budget. Not gaps.                                  |

向, 景, 態, 織, 泣, 差, 怒 and 空 are character-gap cards for kanji that 向こう, 景色, 態度, 織る, 泣く,
差別, 怒る and 青空 use before the book teaches them (`src/reading/characterGaps.js`). Their meanings
and readings check out against the official school list, so they are in bounds.

## Faithful

Every shipping card's spelling, romaji and English match the book: 使用中 shiyōchū "Occupied", 共働き
tomobataraki "Both husband and wife working", 子牛 kōshi "Calf; veal", 再起動 saikidō "Reboot",
赤道 sekidō "The equator", 三十度 sanjū-do "30 degrees", 早起きする hayaoki suru, 天の川 amanogawa.
大昔 "The distant past" says the same as the book's "ancient times". The two exclusions (はたを織る,
連れて帰る) follow the words-only ruling, and each of their words has a card. The single kanji the book
teaches as words (昔, 畑, 娘 here; 色 earlier) are voiced word cards, and 々 is a silent card with the
book's own gloss. The earlier character cards for 神, 早, 起, 使, 働, 連, 別 carry this table's
meanings and readings. Preflight reports nothing for this unit beyond the two re-read notes on the
exclusions; the only accepted finding touching it (色々な and いろいろ both "Various") is the owner's.

## Findings

**other**

- `-` (牛, 赤, 青, 天), polish: the table teaches 牛 (うし) "cow", 赤 (あか) "red color" and 青 (あお)
  "blue color" as words, and the reading list glosses 天 (てん) "the heavens; the sky" as a word, but
  all four ship only as silent character cards from earlier units (chapter-9 r-bf9b3e9c32c4,
  chapter-10 r-72776ab68f81 and r-845d1da87f89, chapter-5 r-c3304d1e49e3). This unit's
  as-generated.json had 牛, 赤 and 青 as voiced word cards under those same ids. 昔 and 色, taught the
  same way, are voiced word cards. Same pattern as the chapter-17 and chapter-18 reports.

**book-mismatch**

- chapter-9 `r-304fce687a69` (度), polish: this table glosses the kanji 度 as "time; degrees" and
  teaches it in 一度 "once" and 今度; the build dropped it here as already carded, and the only card,
  chapter-9's word card, says just "Degrees (temperature)".

## Counts

- Items the chapter teaches: 83 (9 standalone kanji characters, 54 kanji-table words including the 5
  kanji that are also words, 20 reading-list words).
- Items carded: 73 (45 by cards in this unit, 28 in earlier units or the kana deck). 3 are proper
  names, 7 are kana-only words the kana budget left out; none is a gap. 度, 牛, 赤, 青 and 天 are
  counted as carded, with the problems above.
- Cards checked: 54 in this unit (52 shipping, 2 excluded), plus 30 earlier-unit and kana-deck cards that carry this
  chapter's items.
- Cards with a finding: 0 in this unit; 5 in earlier units (牛, 赤, 青, 天, 度).
