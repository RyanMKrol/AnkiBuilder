# Reader: chapter-26 (Chapter 00: Kana)

Collection: genki-an-integrated-course-in-elementary-japanese-i-third-ed-reading. One unit, no extras.

This is the collection's kana deck (`docs/designs/reading-decks/09-kana-deck.md`). It has no chapter
of its own: `chapter-outline.mjs af43edd86648b83e 0` reports that no chapter 0 is cached. Its cards
come from the kana-only words every chapter put in its `kanaPool` (in `reading-report.json`), chosen
under a budget of 150 hiragana and 150 katakana words. So the checklist below is the set of cards
the deck holds, each traced to the book chapter that teaches it. Words the budget left out are not
gaps. `kana-report.json` gives a pool of 719, 294 selected (150 hiragana, 144 katakana), and 19
words added on 2026-10-13/14 when phrase cards were cut. That makes 313 items: 299 ship and 14 are
excluded.

Source: I ran `chapter-outline.mjs` for book chapters 1 to 26 and read to each END OF CHAPTER line,
then searched every card's target in that text. Unit chapter-N's pool comes from book chapter N+1.
For the one target with no text hit (the S/M/LL/XL size words) I checked the Lesson 5 (book
chapter 7) table in `chapter-6/candidates/tables-raw.json`, table 31: "S サイズ (size S) / M サイズ
(size M) / L サイズ (size L) / LL サイズ／ XL サイズ (size XL)". No picture-only word needed opening
an image. The vocabulary in pictures is already transcribed in the outline text or the tables.

## What the deck carries, by source

- **Greetings (book ch1)**: おはよう, おはようございます, こんにちは, こんばんは, さようなら,
  おやすみなさい, ありがとう, ありがとうございます, すみません, いいえ, いってきます, いってらっしゃい,
  ただいま, おかえりなさい, いただきます, ごちそうさまでした, はじめまして, よろしくおねがいします,
  じゃあ、また, しつれいします (Expression Notes 1).
- **Numbers (book ch2)**: ゼロ/れい, いち, に, さん, よん/し, ご, ろく, なな/しち, はち, きゅう/く,
  じゅう to じゅうきゅう with both readings of 14, 17 and 19, the tens to きゅうじゅう, ひゃく. よ was cut
  (owner, 2026-10-14).
- **Lesson 1 (ch3)**: time words (いま, ごぜん, ごご, じ, いちじ, はん), the minute forms carded
  (いっぷん, きゅうふん, じゅうよんぷん, じゅうろっぷん, じゅうきゅうふん), school and people words
  (だいがく, こうこう, がくせい, だいがくせい, りゅうがくせい, せんせい, ねんせい, いちねんせい, せんこう,
  わたし, ともだち, じん, にほんじん, にほんご, おねえさん, しゅふ, べんごし, でんわ), countries, majors
  (アジアけんきゅう, コンピューター, ビジネス, ぶんがく, れきし, せいぶつがく).
- **Lesson 2 (ch4)**: things (ノート, ペン, ぼうし, しんぶん, スマホ, Tシャツ, ジーンズ, じしょ, えんぴつ,
  けしゴム, カーテン, ドア), food on the menu pictures (こうちゃ, コーラ, ミルク, ジュース, コーヒー,
  サラダ, ラーメン, カレー, パスタ, そば, ハンバーガー, サンドイッチ, アイスクリーム, ていしょく, メニュー),
  places (ぎんこう, コンビニ, トイレ, としょかん, ゆうびんきょく), prices (よんひゃく, さんびゃく,
  ろっぴゃく, はっぴゃく, きゅうひゃく, さんぜん), expressions (いらっしゃいませ, どうぞ, じゃあ).
- **Lessons 3 to 12 (ch5 to ch14)**: the katakana vocabulary (スポーツ, デート, テニス, テレビ, カフェ,
  ゲーム, アルバイト, クラス, レポート, パン, スーパー, レストラン, バス, ホテル, テスト, サーフィン,
  Lサイズ and the size table, パソコン, シャワー, エアコン, ページ, デパート, サークル, パパ, ママ,
  カメラ, カラオケ, トマト, パーティー, バーベキュー, ホームステイ, スペイン, メール, ギター, ピアノ,
  コンサート, チケット, スキー, ツアー, ホーム, サッカー, ケーキ, ビール, おもちゃ, ルームメイト,
  ホストファミリー, キャンプ, ドライブ, ジャーナリスト, シェフ, プレゼント, インフルエンザ, アレルギー,
  ホームシック, レントゲン), the menus and food pictures of Lessons 8 and 9 (チーズバーガー,
  ダブルバーガー, アップルパイ, ホットティー, アイスコーヒー, シェイク, ぎょうざ, ハンバーグ, カレーライス,
  カレールー, じゃがいも, キャベツ, おかず and the rest), the colours (グレー, ゴールド, シルバー, ピンク,
  オレンジ, ベージュ, グリーン), and kana words such as げんきな, ひまな, しずかな, にぎやかな, きれい,
  ゆっくり, ちょっと, そうですね, どのぐらい, たとえば, サボる, ダイエットする, もうすぐ, のみぐすり,
  くしゃみ.
- **Reading and Writing (ch15 to ch26)**: しゅじん/しゅうじん (the RW1 long-vowel pairs), the
  katakana practice of RW2, メキシコ, たいへんな, クラシック, ワイン, イタリア, りょうり, りょう,
  おめでとうございます, たんじょうびおめでとう, ストレス, アンケート, まず, むかしむかし, じぞう,
  おじぞうさん, びっくりする, the holidays (クリスマス, ハロウィーン, バレンタインデー, ラマダン, ハヌカー),
  ホラー, ボランティア, バンド, アウトドア.
- **Words added when phrases were cut (19)**: あげる, いい, いろいろ, うそ, かゆい, せき, たのしみ,
  たばこ, だいたい, のど, はた, ひく, まっすぐ, やけど, わかる, アボカド, ハラルフード, ピーナッツ, なる.
  Each traces to a phrase the book prints (手をあげてください, うそをつく, かぜをひく, はたを織る,
  アボカドはありますか, ピーナッツアレルギーがあります and so on).

## Coverage verdict

Every shipping card traces to a word the book prints in kana. I found no card whose target is not
in the book. The 14 excluded cards are sound: ten phrases or sentences cut under the words-only
ruling, each with its words carded (やけど, ちょっと, アボカド, ピーナッツ, アレルギー, うそ, ゆっくり,
ハラルフード, わかる, たのしみ); the particles を and へ; にぎやか, a repeat of にぎやかな; and よ, the
bound form of 4. Because this is a budgeted selection there is no book-gap to report.

Several cards come from exercise art or writing prompts, not from a vocabulary list (シリアル from a
Lesson 4 drill picture, ラマダン and ハヌカー from the RW10 writing topics, ゴールデンウィーク from a
culture note, the RW2 katakana-matching words). Under the kana deck's design that is acceptable,
since the deck is reading practice and phrases count like words. I do not report these.

はた "Loom" is inferred, because the book only glosses the phrase はたを織る "to weave". It is correct
Japanese and the card needs some English for the split-out word, so I do not report it either.

## Faithful

Spellings match the book throughout: long vowels (おねえさん, ゆうびんきょく, じゅうきゅうふん), small
kana (いっぷん, じゅうろっぷん, ろっぴゃく, はっぴゃく), mixed forms the book prints (けしゴム, Tシャツ,
アジアけんきゅう, LLサイズ). The fullest forms are used where the book brackets a part (おやすみなさい,
ごちそうさまでした, おかえりなさい). Romaji is consistent Hepburn with macrons and fits each target. The
English follows the book's glosses, and the brackets on cards like ホーム "Platform (at a train
station)", デート "Date (romantic, not calendar)" and おじぞうさん "(affectionate)" keep cards apart.

## Findings

**book-mismatch**

- r-0d0fd2531ac7 さん "Three": the book also teaches 〜さん "Mr./Ms." (Lesson 1 vocabulary), and both
  meanings went into this one card's pool. Only "Three" ships. should-fix.
- r-27a87259d93f ご "Five": the book also teaches 〜ご ". . . language" (Lesson 1). The suffixes じん
  and ねんせい are carded with their meanings, so this one should be too. should-fix.
- r-29c26602d23e せき "Cough": RW1 also prints せき "(seat)" in its long-vowel pairs, the same
  exercise that gives the deck しゅじん and しゅうじん. polish.
- r-1cd72882c51d あげる "To give; to raise (a hand)": this book prints あげる only in 手をあげてください
  "Raise your hand". "To give" is not taught in Genki I. polish.
- r-f76f81e7a0e6 たんじょうびおめでとう: the book prints "(お)たんじょうびおめでとう". The deck's own
  convention takes the fullest form (おやすみ(なさい) became おやすみなさい). polish.
- r-2b8c515b4475 きれい: the book prints "きれい（な）", and every other な-adjective here carries な
  (げんきな, ひまな, しずかな, にぎやかな, たいへんな). polish.

No wrong-content, untaught-prerequisite, note-unverifiable or proper-name findings. The deck has no
notes, and the preflight's accepted findings (same-English number readings, LL/XLサイズ, the Latin
letters in サイズ words, the set greetings) are not reported again.

## Counts

- Items the unit holds (its checklist): 313 (294 budget-selected, 19 added). 299 ship, 14 excluded
  with sound reasons.
- Items carded: 299 of the 299 that should ship.
- Cards checked: 299 shipping, plus the 14 exclusions.
- Cards with a finding: 6 (2 should-fix, 4 polish).
