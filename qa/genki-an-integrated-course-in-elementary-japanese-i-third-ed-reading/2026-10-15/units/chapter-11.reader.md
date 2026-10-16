# Reader: chapter-11 (Genki I, Chapter 12: Lesson 10: Winter Vacation Plans)

Reading collection, one unit (`chapter-11`, no extras). Read the whole chapter through the END OF
CHAPTER line, every figure that could hold words (all are exercise pictures, maps and photos; the
only glossed word in one, 蒸し暑い on the weather map, is an exercise gloss and not taught), the unit's
cards.json, as-generated.json, reading-report.json and its rendered faces, and preflight's output.

## What the chapter teaches

Readable word items (the checklist for a reading deck):

- **Nouns (30):** 季節, 春, 秋, 牛乳, ケーキ, すし, 天ぷら, りんご, 料理, サッカー, 野球, 医者, お金持ち, 有名人,
  顔, 年上, 駅, 新幹線, 地下鉄, 船, 飛行機, 予約, ツアー, 動物園, 時間, 世界, 美容院, 手袋, 生活, 今年
- **い-adjectives (5):** 暖かい, 涼しい, 冷たい, 遅い, 眠い
- **な-adjective (1):** 簡単(な)
- **Verbs (7):** かかる, 泊まる, なる, 決める, ごろごろする, 旅行する, 練習する
- **Adverbs and other expressions (13):** 一番, どっち／どちら, 早く／速く, 歩いて, 〜で, どうやって, どのぐらい,
  〜週間, 〜か月, 〜年, このごろ, 〜後, 〜か〜
- **Useful Expressions, At the Station (27):** 普通, 急行, 特急; 〜行き, 〜方面; 乗車券, 自由席, 定期券, 一号車,
  学割, 往復, 指定席, 片道, 交通系ICカード; 〜番線, 売店, 切符売り場, 出口, 改札, 入口, ホーム, 階段; 乗り換え,
  次発, 次は〜, 終電, 先発

Out of scope for a reading deck (owner ruling 2026-10-13, words only): the seven grammar points
(〜のほうが〜より, 〜の中で〜がいちばん, adjective/noun + の, 〜つもりだ, adjective + なる, どこか／どこにも, で), the
Expression Notes (〜てくる, sentence-final が), the four station announcements and four station
expressions (sentences), and dialogue/exercise-only words (北海道, 九州, 蒸し暑い and so on).

## Coverage

- **Carded in this unit (58 entries, 59 word cards):** every kanji entry above except the nine below,
  with 早く／速く split into two cards (r-5183903f3825, r-e389584bbdad). 船 and 駅 are correctly word
  cards (voiced), not character cards.
- **Carded earlier as a voiced word, sound:** 料理 (chapter-9), 顔 (chapter-8), 時間 and 今年
  (chapter-5), 遅い (chapter-9). Meanings cover this chapter's glosses.
- **Kana-only, go to the kana deck (15), not gaps:** ケーキ, すし, りんご, サッカー, ツアー, かかる, なる,
  ごろごろする, どっち／どちら, 〜で, どうやって, どのぐらい, このごろ, 〜か〜, ホーム. All in reading-report.json's
  kanaPool.
- **Excluded, reason holds:** 次は〜 (r-76c5d9145145), owner cut 2026-10-14; 次 ships in chapter-7 as
  "Next", voiced つぎ.
- **Gaps (4):** 春, 秋, 〜年, 〜後. The build generated all four, then dropped them without a line in
  reading-report.json because chapter-5 already holds a silent character card with the same target
  (same id). For 春 and 秋 those are KANJIDIC gap cards, so はる and あき are never voiced anywhere; for
  年 and 後 the character cards' English ("Year", "After") also misses the sense this chapter teaches
  (". . . years", "in . . . time"). Same pattern as the 時 finding in chapter-5 and 海 in chapter-6.

Character cards: 53 single-kanji cards, every one a kanji used by a word carded in this unit and not
carded earlier; no kanji in the unit's words lacks a card at or before this chapter. Meanings and
on/kun readings checked against the usual dictionary senses; all are right.

## Faithful

Every shipping word card is spelled as the book prints it (kanji column, okurigana, 天ぷら with its
kana, お金持ち with お, か月 with kana か, 簡単 without the (な)), its romaji matches the book's kana, and
the English is the book's gloss or a short disambiguation of it (改札 "Ticket gate" for "gate", 売店
"Kiosk; stand" beside the 店 "Shop" card, 普通 "Local (train); ordinary", 涼しい "Cool (weather)",
冷たい "Cold (things; people)"). 歩いて is carded as printed because the book lists it as an adverb, "on
foot". No proper names, no sentences, no aiSuggested cards. 交通系ICカード's Latin letters are accepted
in .preflight-accepted.json and not re-reported, nor is the 牛乳/ミルク "Milk" pair or the 通 sokuon note.

## Findings

**book-gap (should-fix)**

- chapter-11/-/book-gap/1: 春 (はる) not carded as a word; only chapter-5's silent gap card r-3e450648252d.
- chapter-11/-/book-gap/2: 秋 (あき) not carded as a word; only chapter-5's silent gap card r-8d8f4aeca850.
- chapter-11/-/book-gap/3: 〜年 ". . . years" dropped onto chapter-5's silent 年 "Year" (r-6f14c2641c25).
- chapter-11/-/book-gap/4: 〜後 "in . . . time" dropped onto chapter-5's silent 後 "After" (r-a1a8cfd1dec3).

**other (polish)**

- chapter-11/-/other/1: romaji lines carry a full-width 〜 (方面 r-c64f974fa90b, 番線 r-856d5830b52b,
  週間 r-ae5d2000edcb, 行き r-cd91af5d05a4, か月 r-370f0655dc10).

## Counts

- Items the chapter teaches (readable word entries): 83
- Items carded: 79 (58 here, 5 earlier as words, 15 in the kana deck, 1 excluded with a sound reason
  whose word is carded); 4 gaps
- Cards checked: 112 shipping (59 word, 53 character) plus 1 excluded
- Cards with a finding: 5 (the five romaji cards); 4 further findings are gaps with no card
