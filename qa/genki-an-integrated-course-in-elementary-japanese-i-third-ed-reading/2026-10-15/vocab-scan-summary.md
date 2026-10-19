# Genki I reading deck: vocabulary scan summary

This is the T4 vocabulary scan from the October 2026 QA fix pass, run over all 26 chapters of the
Genki I reading collection. It reran the reading chapter reader with the widened rule (vocabulary
from anywhere in the chapter, not only the vocabulary lists) and compared what it found with the
cards the collection already has. No cards were added. The rows behind every number here are in
`vocab-scan.jsonl` beside this file, and each chapter's raw reply is in `vocab-scan/<n>.json`.

The run took three sittings. Chapters 1 and 2 were saved on 2026-10-15 before a usage limit stopped
it. On 2026-10-19 the rest ran, except Lesson 6 (chapter 8) and Lesson 8 (chapter 10), whose replies
failed the reader's section check because each left out one exercise heading. A second run retried
just those two and they passed.

## The counts

The scan found 3,137 candidate words. That counts a word once per chapter, so a word that shows up
in four chapters is four rows. As distinct written forms it is 1,814.

- 2,325 already have a card somewhere in the collection.
- 20 are "skip, carded there": the word only appears in passing in an earlier chapter, and a later
  chapter's vocabulary list teaches it, so it gets its card there. They are えいご (eigo), first seen in
  Lesson 1 and taught in Lesson 2; きょうし (kyōshi) from Lesson 1 and しゅっしん (shusshin) from Lesson 2,
  both taught in Lesson 11; あなた (anata) from Lesson 1, taught in Lesson 4; しごと (shigoto) from
  Lesson 1, おにぎり (onigiri) from Lesson 4, どう (dō) from Lesson 5 and いる (iru) from Lesson 6, all
  taught in Lesson 8; すし (sushi) from Lesson 4 and いちばん (ichiban) from Lesson 9, taught in Lesson
  10; かわいい (kawaii) from Lesson 5, taught in Lesson 7; おもち (omochi) from Lesson 11, taught in
  Reading and Writing 10; きもの (kimono) from Reading and Writing 3, taught in Reading and Writing 9;
  とる (toru) from Reading and Writing 5, taught in Reading and Writing 7; and ある (aru), which turns up
  in six earlier chapters and is taught in Reading and Writing 12.
- 792 would become new cards. As distinct forms that is 515, because some words turn up in more than
  one chapter and the list below shows each place.

Of the 792 new-card rows, the book glosses 422, so their English comes straight from the page. The
other 370 have no English in the book and would need the translate pass. They are marked "not
glossed" in the list.

One thing to know before you read the list. 701 of the 792 are written in kana only (438 distinct
forms). In this collection a kana-only word does not get a chapter card: it can only go into the one
kana deck, and that deck picks its words by a budget. That is why plain list words like これ (kore)
and ほん (hon) show up here with no card. Only 91 rows (77 distinct forms) contain kanji and would be
ordinary chapter cards; 65 of those are glossed by the book.

Where the 792 were found: 291 in a vocabulary list (268 of them kana only), 207 in an exercise, 126
in a reading passage, 65 in an example sentence, 61 in a dialogue, 29 in other boxed text such as
expression notes, 8 in a culture note and 5 in a kanji table.

## Words that would become new cards

Each line is the word as the book writes it, its romaji, the English, and where it appeared (the
kind of place, then the section heading). Strike any you do not want. The romaji here is a quick
machine rendering to help you read the list; the real cards get theirs from the usual romaji pass.

### Chapter 02: Numbers (1)

- (よ) (yo) "Four", vocabulary list, すうじ (suu ji)

### Chapter 03: Lesson 1: New Friends (90)

- にじはん (nijihan) "Half past two", vocabulary list, Time
- さい (sai) "...years old (counter)", vocabulary list, Others
- ばん (ban) "Number... (counter)", vocabulary list, Others
- ばんごう (bangō) "Number", vocabulary list, Others
- なまえ (namae) "Name", vocabulary list, Others
- なん (nan) "What", vocabulary list, Others
- なに (nani) "What", vocabulary list, Others
- あのう (anō) "Um...", vocabulary list, Expressions
- はい (hai) "Yes", vocabulary list, Expressions
- そうです (sō desu) "That's right", vocabulary list, Expressions
- そうですか (sō desu ka) "I see.; Is that so?", vocabulary list, Expressions
- かんこく (kankoku) "Korea", vocabulary list, Countries (くに (kuni))
- けいざい (keizai) "Economics", vocabulary list, Majors (せんこう (senkoo))
- こうがく (kōgaku) "Engineering", vocabulary list, Majors (せんこう (senkoo))
- こくさいかんけい (kokusaikankei) "International relations", vocabulary list, Majors (せんこう (senkoo))
- せいじ (seiji) "Politics", vocabulary list, Majors (せんこう (senkoo))
- いしゃ (isha) "Doctor", vocabulary list, Occupations (しごと (shigoto))
- かいしゃいん (kaishain) "Office worker", vocabulary list, Occupations (しごと (shigoto))
- かんごし (kangoshi) "Nurse", vocabulary list, Occupations (しごと (shigoto))
- こうこうせい (kōkōsei) "High school student", vocabulary list, Occupations (しごと (shigoto))
- だいがくいんせい (daigakuinsei) "Graduate student", vocabulary list, Occupations (しごと (shigoto))
- おかあさん (okāsan) "Mother", vocabulary list, Family (かぞく (kazoku))
- おとうさん (otōsan) "Father", vocabulary list, Family (かぞく (kazoku))
- おにいさん (oniisan) "Older brother", vocabulary list, Family (かぞく (kazoku))
- いもうと (imōto) "Younger sister", vocabulary list, Family (かぞく (kazoku))
- おとうと (otōto) "Younger brother", vocabulary list, Family (かぞく (kazoku))
- なんねんせい (nan nen sei) "What year (in school)", dialogue, Dialogue I
- じゅうきゅうさい (jūkyūsai) "Nineteen years old", dialogue, Dialogue II
- なんじ (nan ji) "What time", example sentence, 2 Question Sentences
- なんさい (nan sai) "How old", example sentence, 2 Question Sentences
- なんばん (nan ban) "What number", example sentence, 2 Question Sentences
- ちゃん (chan) "Title for children", other, Expression Notes
- くん (kun) "Title for boys", other, Expression Notes
- かんこくじん (kankokujin) "Korean (person)", exercise, Ⅰ メアリー (mearī) さんは (san wa) アメリカ (amerika) じんです (jin desu)
- イギリスじん (igirisujin) "British (person)", exercise, Ⅰ メアリー (mearī) さんは (san wa) アメリカ (amerika) じんです (jin desu)
- アメリカじん (amerikajin) "American (person)", exercise, Ⅰ メアリー (mearī) さんは (san wa) アメリカ (amerika) じんです (jin desu)
- さんねんせい (sannensei) "Third-year student", exercise, B. Tell which year they are in school., not glossed
- ごねんせい (gonensei) "Fifth-year student", exercise, B. Tell which year they are in school., not glossed
- にねんせい (ninensei) "Second-year student", exercise, B. Tell which year they are in school., not glossed
- よねんせい (yonensei) "Fourth-year student", exercise, B. Tell which year they are in school., not glossed
- ろくねんせい (rokunensei) "Sixth-year student", exercise, B. Tell which year they are in school., not glossed
- いっさい (issai) "One year old", exercise, C. Tell how old they are., not glossed
- にさい (nisai) "Two years old", exercise, C. Tell how old they are., not glossed
- さんさい (sansai) "Three years old", exercise, C. Tell how old they are., not glossed
- よんさい (yonsai) "Four years old", exercise, C. Tell how old they are., not glossed
- ごさい (gosai) "Five years old", exercise, C. Tell how old they are., not glossed
- ろくさい (rokusai) "Six years old", exercise, C. Tell how old they are., not glossed
- ななさい (nanasai) "Seven years old", exercise, C. Tell how old they are., not glossed
- はっさい (hassai) "Eight years old", exercise, C. Tell how old they are., not glossed
- きゅうさい (kyūsai) "Nine years old", exercise, C. Tell how old they are., not glossed
- じゅっさい (jussai) "Ten years old", exercise, C. Tell how old they are., not glossed
- じゅういっさい (jūissai) "Eleven years old", exercise, C. Tell how old they are., not glossed
- はたち (hatachi) "Twenty years old (traditional)", exercise, C. Tell how old they are., not glossed
- にじゅっさい (nijussai) "Twenty years old (regular)", exercise, C. Tell how old they are., not glossed
- にじゅういっさい (nijūissai) "Twenty-one years old", exercise, C. Tell how old they are., not glossed
- さんじゅうごさい (sanjūgosai) "Thirty-five years old", exercise, C. Tell how old they are., not glossed
- よんじゅっさい (yonjussai) "Forty years old", exercise, C. Tell how old they are., not glossed
- にじ (niji) "Two o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- さんじ (sanji) "Three o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- よじ (yoji) "Four o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- ごじ (goji) "Five o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- ろくじ (rokuji) "Six o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- しちじ (shichiji) "Seven o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time)
- はちじ (hachiji) "Eight o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- くじ (kuji) "Nine o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time)
- じゅうじ (jūji) "Ten o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- じゅういちじ (jūichiji) "Eleven o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- じゅうにじ (jūniji) "Twelve o'clock", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- いちじはん (ichijihan) "Half past one", vocabulary list, Ⅴ じかん (ji ka n) (Time), not glossed
- ごしゅっしん (goshusshin) "Hometown; place of origin", exercise, A. Class Activity: Ask five classmates questions and fill in the chart below.
- よじはん (yojihan) "Half past four", other, Hours, not glossed
- にふん (nifun) "Two minutes", vocabulary list, Minutes, not glossed
- さんぷん (sampun) "Three minutes", vocabulary list, Minutes, not glossed
- よんぷん (yompun) "Four minutes", vocabulary list, Minutes, not glossed
- ごふん (gofun) "Five minutes", vocabulary list, Minutes, not glossed
- ろっぷん (roppun) "Six minutes", vocabulary list, Minutes, not glossed
- ななふん (nanafun) "Seven minutes", vocabulary list, Minutes, not glossed
- はっぷん (happun) "Eight minutes", vocabulary list, Minutes, not glossed
- はちふん (hachifun) "Eight minutes", vocabulary list, Minutes, not glossed
- じゅっぷん (juppun) "Ten minutes", vocabulary list, Minutes, not glossed
- じゅういっぷん (jūippun) "Eleven minutes", vocabulary list, Minutes, not glossed
- じゅうにふん (jūnifun) "Twelve minutes", vocabulary list, Minutes, not glossed
- じゅうさんぷん (jūsampun) "Thirteen minutes", vocabulary list, Minutes, not glossed
- じゅうごふん (jūgofun) "Fifteen minutes", vocabulary list, Minutes, not glossed
- じゅうななふん (jūnanafun) "Seventeen minutes", vocabulary list, Minutes, not glossed
- じゅうはっぷん (jūhappun) "Eighteen minutes", vocabulary list, Minutes, not glossed
- じゅうはちふん (jūhachifun) "Eighteen minutes", vocabulary list, Minutes, not glossed
- にじゅっぷん (nijuppun) "Twenty minutes", vocabulary list, Minutes, not glossed
- さんじゅっぷん (sanjuppun) "Thirty minutes", vocabulary list, Minutes, not glossed
- ごじゅうごふん (gojūgofun) "Fifty-five minutes", other, Minutes, not glossed

### Chapter 04: Lesson 2: Shopping (71)

- なん (nan) "What", dialogue, Ⅱ After shopping, Mary goes to a restaurant.
- これ (kore) "This one", vocabulary list, Words That Point
- それ (sore) "That one", vocabulary list, Words That Point
- あれ (are) "That one (over there)", vocabulary list, Words That Point
- どれ (dore) "Which one", vocabulary list, Words That Point
- この (kono) "This . . .", vocabulary list, Words That Point
- その (sono) "That . . .", vocabulary list, Words That Point
- あの (ano) "That . . . (over there)", vocabulary list, Words That Point
- どの (dono) "Which . . .", vocabulary list, Words That Point
- ここ (koko) "Here", vocabulary list, Words That Point
- そこ (soko) "There", vocabulary list, Words That Point
- あそこ (asoko) "Over there", vocabulary list, Words That Point
- どこ (doko) "Where", vocabulary list, Words That Point
- だれ (dare) "Who", vocabulary list, Words That Point
- おいしい (oishii) "Delicious", vocabulary list, Food
- さかな (sakana) "Fish", vocabulary list, Food
- とんかつ (tonkatsu) "Pork cutlet", vocabulary list, Food
- にく (niku) "Meat", vocabulary list, Food
- やさい (yasai) "Vegetable", vocabulary list, Food
- かさ (kasa) "Umbrella", vocabulary list, Things
- かばん (kaban) "Bag", vocabulary list, Things
- くつ (kutsu) "Shoes", vocabulary list, Things
- さいふ (saifu) "Wallet", vocabulary list, Things
- じてんしゃ (jitensha) "Bicycle", vocabulary list, Things
- とけい (tokei) "Watch; clock", vocabulary list, Things
- ほん (hon) "Book", vocabulary list, Things
- かんこく (kankoku) "Korea", vocabulary list, Countries
- えいご (eigo) "English (language)", vocabulary list, Majors
- けいざい (keizai) "Economics", vocabulary list, Majors
- おかあさん (okāsan) "Mother", vocabulary list, Family
- おとうさん (otōsan) "Father", vocabulary list, Family
- いくら (ikura) "How much", vocabulary list, Money Matters
- えん (en) "Yen", vocabulary list, Money Matters
- たかい (takai) "Expensive; high", vocabulary list, Money Matters
- おねがいします (onegai shi masu) "...，please", vocabulary list, Expressions
- ください (kudasai) "Please give me ...", vocabulary list, Expressions
- どうも (dōmo) "Thank you", vocabulary list, Expressions
- イギリスじん (igirisujin) "British (person)", example sentence, 7 〜ね (ne)/〜よ (yo)
- にじゅうさんまん (nijūsamman) "230,000", vocabulary list, Big numbers, not glossed
- にひゃく (nihyaku) "200", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- ごひゃく (gohyaku) "500", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- ななひゃく (nanahyaku) "700", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- せん (sen) "1,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- にせん (nisen) "2,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- よんせん (yonsen) "4,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- ごせん (gosen) "5,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- ろくせん (rokusen) "6,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- ななせん (nanasen) "7,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- はっせん (hassen) "8,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- きゅうせん (kyūsen) "9,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- いちまん (ichiman) "10,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- にまん (niman) "20,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- さんまん (samman) "30,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- よんまん (yomman) "40,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- ごまん (goman) "50,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- ろくまん (rokuman) "60,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- ななまん (nanaman) "70,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- はちまん (hachiman) "80,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- きゅうまん (kyūman) "90,000", vocabulary list, Ⅰ すうじ (suu ji) (Numbers)
- アメリカじん (amerikajin) "American (person)", example sentence, A. Look at the chart below and answer the questions., not glossed
- ちゅうごくじん (chūgokujin) "Chinese (person)", exercise, A. Look at the chart below and answer the questions., not glossed
- かんこくじん (kankokujin) "Korean (person)", exercise, A. Look at the chart below and answer the questions., not glossed
- にねんせい (ninensei) "2nd-year student", exercise, A. Look at the chart below and answer the questions., not glossed
- よねんせい (yonensei) "4th-year student", exercise, A. Look at the chart below and answer the questions., not glossed
- さんねんせい (sannensei) "3rd-year student", exercise, C. Pair Work: Ask each other yes-no questions such as year in school, major..., not glossed
- うどん (udon) "Udon (wheat noodles)", vocabulary list, Ⅷ まとめの (matome no) れんしゅう (ren shū) (Review Exercises), not glossed
- こくばん (kokuban) "Blackboard", vocabulary list, きょうしつ (kyōshi tsu) In the Classroom
- でんき (denki) "Light", vocabulary list, きょうしつ (kyōshi tsu) In the Classroom
- つくえ (tsukue) "Desk", vocabulary list, きょうしつ (kyōshi tsu) In the Classroom
- まど (mado) "Window", vocabulary list, きょうしつ (kyōshi tsu) In the Classroom
- いす (isu) "Chair", vocabulary list, きょうしつ (kyōshi tsu) In the Classroom

### Chapter 05: Lesson 3: Making a Date (19)

- そうですか (sō desu ka) "I see", dialogue, Ⅰ Mary and Takeshi are talking., not glossed
- うち (uchi) "Home; house; my place", vocabulary list, Places
- いつ (itsu) "When", vocabulary list, Time
- ごろ (goro) "At about . . .", vocabulary list, Time
- する (suru) "To do", vocabulary list, Irregular Verbs
- あまり (amari) "Not much", vocabulary list, Adverbs
- たいてい (taitei) "Usually", vocabulary list, Adverbs
- よく (yoku) "Often; much", vocabulary list, Adverbs
- でも (demo) "But", vocabulary list, Expressions
- どうですか (dō desu ka) "How about . . . ?; How is . . . ?", vocabulary list, Expressions
- ええ (ē) "Yes", vocabulary list, Expressions
- 専攻 (senkō) "Major (academic)", example sentence, 8 The Topic Particle は (wa), not glossed
- ください (kudasai) "Please give me", example sentence, ちょっと (chotto), not glossed
- はい (hai) "Yes; Here (in response to a name)", example sentence, はい (hai)/ええ (ē)
- ニュース (nyūsu) "News", exercise, D. Pair Work: Guessing Game
- アニメ (anime) "Cartoon; anime", exercise, D. Pair Work: Guessing Game
- 中国語 (chūgokugo) "Chinese (language)", exercise, D. Pair Work: Guessing Game, not glossed
- バドミントン (badominton) "Badminton", exercise, C. Pair Work: Use the cues below and make suggestions to do something together...
- ふすま (fusuma) "Sliding door (opaque, paper)", culture note, 日本の (nippon no) 家 (ie) Japanese Houses, not glossed

### Chapter 06: Lesson 4: The First Date (59)

- あそこ (asoko) "Over there", dialogue, I Mary goes downtown.
- どこ (doko) "Where", dialogue, I Mary goes downtown.
- そうですか (sō desu ka) "I see", dialogue, II In the evening, at Mary's host family's house.
- えっ (etsu) "What?! (incredulous)", dialogue, II In the evening, at Mary's host family's house.
- あっ (atsu) "Oh! (sudden realization)", dialogue, II In the evening, at Mary's host family's house.
- あなた (anata) "You", vocabulary list, People and Things
- いす (isu) "Chair", vocabulary list, People and Things
- ある (aru) "There is . . . (non-living things)", vocabulary list, U-verbs
- いる (iru) "(A person) is in . . . ; stays at . . .", vocabulary list, Ru-verb
- ごめんなさい (gomennasai) "I'm sorry", vocabulary list, Adverbs and Other Expressions
- それから (sorekara) "And then", vocabulary list, Adverbs and Other Expressions
- だから (dakara) "So; therefore", vocabulary list, Adverbs and Other Expressions
- たくさん (takusan) "Many; a lot", vocabulary list, Adverbs and Other Expressions
- どうして (dōshite) "Why", vocabulary list, Adverbs and Other Expressions
- 一人で (hitori de) "Alone", vocabulary list, Adverbs and Other Expressions
- もしもし (moshimoshi) "Hello? (used on the phone)", vocabulary list, Adverbs and Other Expressions
- あした (ashita) "Tomorrow", example sentence, 1 X があります (ga ari masu) / います (i masu)
- 留学生 (ryūgakusei) "International student", example sentence, 2 Describing Where Things Are
- ここ (koko) "Here", example sentence, 2 Describing Where Things Are
- そこ (soko) "There (near you)", example sentence, 2 Describing Where Things Are
- 傘 (kasa) "Umbrella", example sentence, 2 Describing Where Things Are
- テーブル (tēburu) "Table (furniture)", example sentence, 2 Describing Where Things Are
- よこ (yoko) "Beside; next to", example sentence, 2 Describing Where Things Are
- かばん (kaban) "Bag", example sentence, 2 Describing Where Things Are
- 靴 (kutsu) "Shoes", example sentence, 5 も (mo)
- 野菜 (yasai) "Vegetable", example sentence, 7 たくさん (takusan)
- 韓国 (kankoku) "Korea", example sentence, 8 と (to)
- むかい (mukai) "Opposite; across", other, X の (no) 前 (mae)
- うら (ura) "Behind (hidden side); reverse side", other, X の (no) 前 (mae)
- 教室 (kyōshitsu) "Classroom", exercise, B. Answer the following questions.
- だれ (dare) "Who", exercise, B. Answer the following questions.
- 中国語 (chūgokugo) "Chinese (language)", exercise, C. Look at Takeshi’s schedule for the week and answer the following questions.
- 帽子 (bōshi) "Hat", exercise, B. Pair Work: You and your partner have just moved to a new place. The room is...
- 専攻 (senkō) "Major (field of study)", exercise, A. Look at the information about Professor Yamashita 25 years ago and answer...
- 歴史 (rekishi) "History", exercise, A. Look at the information about Professor Yamashita 25 years ago and answer...
- とんかつ (tonkatsu) "Tonkatsu (pork cutlet)", exercise, C. Pair Work: Guess what your partner had for breakfast/lunch/dinner. Choose...
- おちゃ (ocha) "Tea", exercise, B．Describe the pictures using も (mo).
- インターネット (intānetto) "Internet", exercise, B. Pair Work: Ask your partner the following questions.
- よく (yoku) "Often", exercise, A. Pair Work: Using the expressions below, ask your partner how often they did..., not glossed
- ときどき (tokidoki) "Sometimes", exercise, A. Pair Work: Using the expressions below, ask your partner how often they did..., not glossed
- あまり (amari) "Not very (often)", exercise, A. Pair Work: Using the expressions below, ask your partner how often they did..., not glossed
- ぜんぜん (zenzen) "Not at all", exercise, A. Pair Work: Using the expressions below, ask your partner how often they did..., not glossed
- バドミントン (badominton) "Badminton", exercise, B. Answer the following questions.
- 授業料 (jugyōryō) "Tuition (fee)", exercise, University Research
- いくら (ikura) "How much (price)", exercise, University Research
- ついたち (tsuitachi) "1st (of the month)", vocabulary list, Days
- ふつか (futsuka) "2nd (of the month)", vocabulary list, Days
- みっか (mikka) "3rd (of the month)", vocabulary list, Days
- よっか (yokka) "4th (of the month)", vocabulary list, Days
- いつか (itsuka) "5th (of the month)", vocabulary list, Days
- なのか (nanoka) "7th (of the month)", vocabulary list, Days
- ようか (yōka) "8th (of the month)", vocabulary list, Days
- ここのか (kokonoka) "9th (of the month)", vocabulary list, Days
- とおか (tōka) "10th (of the month)", vocabulary list, Days
- おととい (ototoi) "The day before yesterday", vocabulary list, Time Words
- 二週間前 (nishūkammae) "Two weeks ago", vocabulary list, Time Words
- 二か月前 (nikagetsumae) "Two months ago", vocabulary list, Time Words
- おととし (ototoshi) "The year before last", vocabulary list, Time Words
- あさって (asatte) "The day after tomorrow", vocabulary list, Time Words

### Chapter 07: Lesson 5: A Trip to Okinawa (27)

- たべもの (tabemono) "Food", vocabulary list, Nouns
- つまらない (tsumaranai) "Boring", vocabulary list, い (i)-adjectives
- やさしい (yasashii) "Easy (problem); kind (person)", vocabulary list, い (i)-adjectives
- かっこいい (kakkoii) "Good-looking", vocabulary list, い (i)-adjectives
- きれい (kirei) "Beautiful; clean", vocabulary list, な (na)-adjectives
- にぎやか (nigiyaka) "Lively", vocabulary list, な (na)-adjectives
- やる (yaru) "To do; to perform", vocabulary list, U-verbs
- すごく (sugoku) "Extremely", vocabulary list, Adverbs and Other Expressions
- とても (totemo) "Very", vocabulary list, Adverbs and Other Expressions
- どんな (donna) "What kind of...", vocabulary list, Adverbs and Other Expressions
- あまり (amari) "Not very (used with a negative)", example sentence, 1 Adjectives (Present Tense), not glossed
- なっとう (nattō) "Natto (fermented soybeans)", example sentence, 4 好き (suki)(な (na))/きらい (kirai)(な (na))
- 野菜 (yasai) "Vegetables", example sentence, 4 好き (suki)(な (na))/きらい (kirai)(な (na))
- あそこ (asoko) "There; over there", example sentence, 5 〜ましょう (mashō) / 〜ましょうか (mashō ka)
- おいしい (oishii) "Delicious", exercise, C. Answer the following questions., not glossed
- となり (tonari) "Next to; neighbor", exercise, E. Pair Work: Make your own sentences on the topics below using adjectives, and..., not glossed
- ゴルフ (gorufu) "Golf", exercise, A. Pair Work: Choose the items from the following categories and ask your...
- ロック (rokku) "Rock (music)", exercise, A. Pair Work: Choose the items from the following categories and ask your...
- ジャズ (jazu) "Jazz", exercise, A. Pair Work: Choose the items from the following categories and ask your...
- Jポップ (Jpoppu) "J-pop", exercise, A. Role Play: Ask what kind of activities your partner likes and ask to do them...
- どこ (doko) "Where", exercise, C. Class Activity: Show and Tell, not glossed
- だれ (dare) "Who", exercise, C. Class Activity: Show and Tell, not glossed
- でも (demo) "But; however", dialogue, Ⅰ Robert and Ken are vacationing in Okinawa.
- ええ (ē) "Yes", dialogue, Ⅰ Robert and Ken are vacationing in Okinawa.
- いくら (ikura) "How much", dialogue, Ⅱ At the souvenir shop, Robert finds nice T-shirts.
- はい (hai) "Yes", dialogue, Ⅱ At the souvenir shop, Robert finds nice T-shirts.
- じゃ (ja) "Well then; in that case", dialogue, Ⅱ At the souvenir shop, Robert finds nice T-shirts.

### Chapter 08: Lesson 6: A Day in Robert's Life (14)

- つける (tsukeru) "To turn on", vocabulary list, Ru-verbs
- すぐ (sugu) "Right away", vocabulary list, Adverbs and Other Expressions
- 結構です (kekkō desu) "That would be fine.; That wouldn't be necessary.", vocabulary list, Adverbs and Other Expressions
- 本当ですか (hontō desu ka) "Really?", vocabulary list, Adverbs and Other Expressions
- あした (ashita) "Tomorrow", dialogue, Ⅱ After class.
- どうも (dōmo) "Thanks; I'm sorry (casual, short form)", dialogue, Ⅲ On the bus.
- タクシー (takushī) "Taxi", example sentence, 6 〜から (kara)
- やる (yaru) "To do", example sentence, 7 〜ましょうか (mashō ka) (Offering Assistance)
- 義務教育 (gimukyōiku) "Compulsory education", culture note, 日本の教育制度 (nippon no kyōiku seido)（１） Japan's Educational System (1)
- 夏休み (natsuyasumi) "Summer vacation", culture note, 日本の教育制度 (nippon no kyōiku seido)（１） Japan's Educational System (1)
- 冬休み (fuyuyasumi) "Winter vacation", culture note, 日本の教育制度 (nippon no kyōiku seido)（１） Japan's Educational System (1)
- 春休み (haruyasumi) "Spring vacation", culture note, 日本の教育制度 (nippon no kyōiku seido)（１） Japan's Educational System (1)
- 寮 (ryō) "Dormitory", exercise, B. Answer the following questions.
- シェアハウス (sheahausu) "Shared house", exercise, B. Answer the following questions.

### Chapter 09: Lesson 7: Family Picture (23)

- おじいさん (ojiisan) "Grandfather; old man", vocabulary list, Nouns
- おばあさん (obāsan) "Grandmother; old woman", vocabulary list, Nouns
- 背が高い (se ga takai) "Tall (stature)", vocabulary list, い (i)-adjectives
- 背が低い (se ga hikui) "Short (stature)", vocabulary list, い (i)-adjectives
- 頭がいい (a tama ga ii) "Bright; smart; clever", vocabulary list, い (i)-adjectives
- かわいい (kawaii) "Cute", vocabulary list, い (i)-adjectives
- かぶる (kaburu) "To put on (a hat)", vocabulary list, U-verbs
- はく (haku) "To put on (items below your waist)", vocabulary list, U-verbs
- 知っています (shitteimasu) "I know", vocabulary list, U-verbs
- 知りません (shirimasen) "I do not know", vocabulary list, U-verbs
- 太っています (futotteimasu) "To be on the heavy side; overweight", vocabulary list, U-verbs
- かける (kakeru) "To put on (glasses)", vocabulary list, Ru-verbs
- やせる (yaseru) "To lose weight", vocabulary list, Ru-verbs
- やせています (yaseteimasu) "To be thin", vocabulary list, Ru-verbs
- もちろん (mochiron) "Of course", vocabulary list, Adverbs and Other Expressions
- よかったら (yokattara) "If you like", vocabulary list, Adverbs and Other Expressions
- かっこいい (kakkoii) "Good-looking; cool", dialogue, 会話 (kaiwa) Dialogue
- もしもし (moshimoshi) "Hello (on the phone)", dialogue, Ⅱ Yui's phone rings.
- トランプ (torampu) "Playing cards", vocabulary list, 遊ぶ (asobu)
- にぎやか (nigiyaka) "Lively; bustling", exercise, A. Mary has been enjoying her life in Japan. She talks about her friends and...
- だんな (danna) "Husband (casual term)", culture note, 家族の呼び方 (kazoku no yobi kata) Kinship Terms
- おしり (oshiri) "Buttocks", vocabulary list, 体の部分 (karada no bubun), not glossed
- おなか (onaka) "Stomach; belly", vocabulary list, 体の部分 (karada no bubun), not glossed

### Chapter 10: Lesson 8: Barbecue (66)

- あさって (asatte) "The day after tomorrow", vocabulary list, Nouns
- はし (hashi) "Chopsticks", vocabulary list, Nouns
- いる (iru) "To need (something)", vocabulary list, U-verbs
- 遅くなる (osokunaru) "To be late", vocabulary list, U-verbs
- うん (un) "Uh-huh; yes", vocabulary list, Adverbs and Other Expressions
- ううん (ūn) "Uh-uh; no", vocabulary list, Adverbs and Other Expressions
- いつも (itsumo) "Always", vocabulary list, Adverbs and Other Expressions
- みんなで (minnade) "All (of the people) together", vocabulary list, Adverbs and Other Expressions
- 残念ですね (zannendesune) "That's too bad", vocabulary list, Adverbs and Other Expressions
- まだ (mada) "Not yet (with a negative)", vocabulary list, Adverbs and Other Expressions
- について (nitsuite) "About; concerning", vocabulary list, Adverbs and Other Expressions
- どう (dō) "How", vocabulary list, Adverbs and Other Expressions
- あした (ashita) "Tomorrow", dialogue, Ⅰ At school., not glossed
- する (suru) "To do", dialogue, Ⅰ At school., not glossed
- だれ (dare) "Who", dialogue, Ⅰ At school., not glossed
- ええ (ē) "Yes", dialogue, Ⅱ Robert is cooking at the barbecue., not glossed
- よく (yoku) "Often", dialogue, Ⅱ Robert is cooking at the barbecue., not glossed
- あっ (atsu) "Oh!", dialogue, Ⅱ Robert is cooking at the barbecue., not glossed
- かわいい (kawaii) "Cute; pretty", exercise, Present, affirmative, not glossed
- ない (nai) "Nonexistent; there isn't", example sentence, Verb short forms (present, negative), not glossed
- 呼ぶ (yobu) "To call (someone)", example sentence, 2 Short Forms in Informal Speech, not glossed
- はい (hai) "Yes", example sentence, 2 Short Forms in Informal Speech, not glossed
- きらい (kirai) "Dislike", exercise, 6 Verb のが (no ga) 好きです (suki desu)/ 上手です (jōzu desu), not glossed
- とくい (tokui) "Good at; comfortable with", example sentence, 6 Verb のが (no ga) 好きです (suki desu)/ 上手です (jōzu desu), not glossed
- にがて (nigate) "Poor at; uncomfortable with", example sentence, 6 Verb のが (no ga) 好きです (suki desu)/ 上手です (jōzu desu), not glossed
- めがね (megane) "Glasses", example sentence, 7 The Subject Particle が (ga), not glossed
- かける (kakeru) "To call (on the phone); to wear (glasses)", exercise, A. Change the affirmatives into negatives., not glossed
- おもしろい (omoshiroi) "Interesting", example sentence, 7 The Subject Particle が (ga), not glossed
- おいしい (oishii) "Delicious", exercise, 〜する (suru), not glossed
- はく (haku) "To wear (shoes); to put on", exercise, A. Change the affirmatives into negatives., not glossed
- わすれる (wasureru) "To forget", exercise, A. Change the affirmatives into negatives., not glossed
- かえる (kaeru) "To return; to go home", exercise, A. Change the affirmatives into negatives., not glossed
- みじかい (mijikai) "Short", exercise, B. Change the affirmatives into negatives., not glossed
- かっこいい (kakkoii) "Cool; good-looking", exercise, B. Change the affirmatives into negatives., not glossed
- ひま (hima) "Free; not busy", exercise, B. Answer the following questions in informal speech, first in the affirmative..., not glossed
- こわい (kowai) "Scary", exercise, B. Answer the following questions in informal speech, first in the affirmative..., not glossed
- たくさん (takusan) "A lot; many", exercise, B. Make a guess about Professor Yamashita and the place below and answer the..., not glossed
- スペイン語 (supeingo) "Spanish language", exercise, B. Make a guess about Professor Yamashita and the place below and answer the..., not glossed
- ときどき (tokidoki) "Sometimes", exercise, A., not glossed
- どんな (donna) "What kind of", exercise, B., not glossed
- つける (tsukeru) "To turn on", exercise, B. Ask a person in the same room if they mind you doing the following things., not glossed
- ラブレター (raburetā) "Love letter", exercise, A. Tell what Mary is good/poor at, using 上手です (or) 下手です (heta desu).
- あまり (amari) "Not very (with a negative)", exercise, B. Pair Work: Ask if your partner likes to do the following activities., not glossed
- イギリス人 (igirisujin) "British person", exercise, A. Use the table below and answer the questions., not glossed
- 韓国人 (kankokujin) "Korean person", exercise, A. Use the table below and answer the questions., not glossed
- 十六日 (jūrokunichi) "The 16th (day of the month)", exercise, A. Pair Work: A and B are making plans for a one-day trip with two other..., not glossed
- 十八日 (jūhachinichi) "The 18th (day of the month)", exercise, A. Pair Work: A and B are making plans for a one-day trip with two other..., not glossed
- でも (demo) "But; however", exercise, A. Pair Work: A and B are making plans for a one-day trip with two other..., not glossed
- そうですか (sōdesuka) "Is that so?", exercise, A. Pair Work: A and B are making plans for a one-day trip with two other..., not glossed
- いつ (itsu) "When", exercise, B. Pair Work/Group Work: You are planning a party. Decide on the following..., not glossed
- どこ (doko) "Where", exercise, B. Pair Work/Group Work: You are planning a party. Decide on the following..., not glossed
- にんじん (ninjin) "Carrot", vocabulary list, Ingredients
- 定食 (teishoku) "Set meal", culture note, 日本の (nippon no) 食べ (tabe) 物 (mono) Foods in Japan, not glossed
- おにぎり (onigiri) "Rice ball(s)", vocabulary list, Common dishes in Japan
- うどん (udon) "Udon noodles", vocabulary list, Common dishes in Japan
- さしみ (sashimi) "Raw seafood; sashimi", vocabulary list, Common dishes in Japan
- たまご (tamago) "Egg", vocabulary list, Common dishes in Japan
- お願いします (onegaishimasu) "Please", vocabulary list, Expressions
- いちご (ichigo) "Strawberry", vocabulary list, 果物 (kudamono) ：
- すいか (suika) "Watermelon", vocabulary list, 果物 (kudamono) ：
- みかん (mikan) "Mandarin orange", vocabulary list, 果物 (kudamono) ：
- りんご (ringo) "Apple", vocabulary list, 果物 (kudamono) ：
- もも (momo) "Peach", vocabulary list, 果物 (kudamono) ：
- ぶどう (budō) "Grape", vocabulary list, 果物 (kudamono) ：
- なす (nasu) "Eggplant", vocabulary list, 野菜 (yasai) ：
- きゅうり (kyūri) "Cucumber", vocabulary list, 野菜 (yasai) ：

### Chapter 11: Lesson 9: Kabuki (31)

- ある (aru) "To exist; to have", vocabulary list, U-verbs, not glossed
- もらう (morau) "To get (from somebody)", vocabulary list, U-verbs
- そう (sō) "(I think) so", vocabulary list, Adverbs and Other Expressions
- ところで (tokorode) "By the way", vocabulary list, Adverbs and Other Expressions
- みんな (minna) "All", vocabulary list, Adverbs and Other Expressions
- もう (mō) "Already", vocabulary list, Adverbs and Other Expressions
- でも (demo) "But", dialogue, Ⅰ Mary and Takeshi are talking., not glossed
- おもしろい (omoshiroi) "Interesting", dialogue, Ⅰ Mary and Takeshi are talking., not glossed
- きれい (kirei) "Pretty; beautiful", dialogue, Ⅱ During intermission at a Kabuki theater., not glossed
- まだ (mada) "Not yet", dialogue, Ⅱ During intermission at a Kabuki theater., not glossed
- ください (kudasai) "Please (give me)", dialogue, Ⅲ At a concession stand., not glossed
- それから (sorekara) "And then; after that", dialogue, Ⅲ At a concession stand., not glossed
- うん (un) "Yeah", example sentence, 2 Past Tense Short Forms in Informal Speech, not glossed
- ううん (ūn) "No; nuh-uh", example sentence, 2 Past Tense Short Forms in Informal Speech, not glossed
- とんかつ (tonkatsu) "Pork cutlet", example sentence, 3 Past Tense Short Forms in Quoted Speech: 〜と (to) 思います (omoi masu), not glossed
- めがね (megane) "Glasses", example sentence, 5 Qualifying Nouns with Verbs and Adjectives, not glossed
- かける (kakeru) "To wear (glasses); to put on", example sentence, 5 Qualifying Nouns with Verbs and Adjectives, not glossed
- どの (dono) "Which (one)", example sentence, 5 Qualifying Nouns with Verbs and Adjectives, not glossed
- きらい (kirai) "Disliked", exercise, B. Make questions about childhood in informal speech. How do you answer those..., not glossed
- やさしい (yasashii) "Kind; gentle", exercise, B. Make questions about childhood in informal speech. How do you answer those..., not glossed
- どう (dō) "How", exercise, C. Pair Work: Ask each other what you did yesterday, last weekend, etc., and..., not glossed
- よく (yoku) "Often; well", exercise, A. Make a guess about what the following people were like when they were in..., not glossed
- かっこいい (kakkoii) "Cool; good-looking", exercise, A. Make a guess about what the following people were like when they were in..., not glossed
- たくさん (takusan) "A lot; many", exercise, B. Pair Work: Talk about the childhood of someone you and your partner know..., not glossed
- お店 (omise) "Shop; store", exercise, B. Pair Work: Ask if your partner has done . . . yet. If the answer is no, ask..., not glossed
- 場所 (basho) "Place", exercise, B. Pair Work: Ask if your partner has done . . . yet. If the answer is no, ask..., not glossed
- すごく (sugoku) "Very; extremely", exercise, B. Pair Work: Ask if your partner has done . . . yet. If the answer is no, ask..., not glossed
- ぜんぜん (zenzen) "Not at all", exercise, B. Complete the following sentences adding reasons., not glossed
- 帽子 (bōshi) "Hat", exercise, B. Answer the following questions., not glossed
- かばん (kaban) "Bag", example sentence, 色 (iro), not glossed
- セーター (sētā) "Sweater", example sentence, Group 2: Nouns, not glossed

### Chapter 12: Lesson 10: Winter Vacation Plans (45)

- すし (sushi) "Sushi", vocabulary list, Nouns
- りんご (ringo) "Apple", vocabulary list, Nouns
- かかる (kakaru) "To take (amount of time/money)", vocabulary list, U-verbs
- ごろごろする (gorogorosuru) "To chill out at home; to stay home and do nothing", vocabulary list, Irregular Verbs
- どっち (dotchi) "Which", vocabulary list, Adverbs and Other Expressions
- どちら (dochira) "Which", vocabulary list, Adverbs and Other Expressions
- どうやって (dōyatte) "How; by what means", vocabulary list, Adverbs and Other Expressions
- このごろ (konogoro) "These days", vocabulary list, Adverbs and Other Expressions
- 冬休み (fuyuyasumi) "Winter vacation", dialogue, Ⅰ Winter vacation is approaching., not glossed
- まだ (mada) "Not yet; still", dialogue, Ⅰ Winter vacation is approaching., not glossed
- おもしろい (omoshiroi) "Interesting", dialogue, Ⅰ Winter vacation is approaching., not glossed
- ぼく (boku) "I (male, casual)", dialogue, Ⅰ Winter vacation is approaching., not glossed
- おいしい (oishii) "Delicious", dialogue, Ⅰ Winter vacation is approaching., not glossed
- ところで (tokorode) "By the way", dialogue, Ⅰ Winter vacation is approaching., not glossed
- おみやげ (omiyage) "Souvenir", dialogue, Ⅰ Winter vacation is approaching., not glossed
- いくら (ikura) "How much (cost)", dialogue, Ⅱ At the hotel front desk., not glossed
- お願いします (onegai shi masu) "Please (request)", dialogue, Ⅱ At the hotel front desk., not glossed
- フランス (furansu) "France", example sentence, 2 Comparison among Three or More Items, not glossed
- みかん (mikan) "Tangerine", example sentence, 2 Comparison among Three or More Items, not glossed
- さくらんぼ (sakurambo) "Cherry", example sentence, 2 Comparison among Three or More Items, not glossed
- セーター (sētā) "Sweater", example sentence, 3 Adjective/Noun + の (no), not glossed
- かばん (kaban) "Bag", example sentence, 3 Adjective/Noun + の (no), not glossed
- はし (hashi) "Chopsticks", example sentence, 7 で (de), not glossed
- かっこいい (kakkoii) "Cool; good-looking (appearance)", exercise, B. Pair Work: Make questions using the following cues and ask your partner..., not glossed
- ドイツ (doitsu) "Germany", exercise, B. Pair Work: Make questions using the following cues and ask your partner...
- 靴 (kutsu) "Shoes", exercise, Ⅲ これは私のです (kore wa watashi no desu) Grammar 3, not glossed
- ガイドブック (gaidobukku) "Guidebook", exercise, B. Mary and Yui did the following things before and during their trip. Describe...
- 傘 (kasa) "Umbrella", exercise, B. Mary and Yui did the following things before and during their trip. Describe..., not glossed
- きれい (kirei) "Pretty; clean", exercise, Ⅴ きれいになりました (kirei ni nari mashi ta), not glossed
- ひま (hima) "Free (time)", exercise, A. Describe the following pictures., not glossed
- つける (tsukeru) "To turn on", exercise, B. Pair Work: Fill in the blanks and read the dialogue with your partner., not glossed
- 野菜 (yasai) "Vegetable", exercise, B. Pair Work: Fill in the blanks and read the dialogue with your partner., not glossed
- インドネシア (indoneshia) "Indonesia", exercise, A. Look at the pictures and answer each question as in the example below., not glossed
- ペンギン (pengin) "Penguin", exercise, A.
- ウォーキング (wōkingu) "Walking", exercise, C. Role Play: One of you is a hotel receptionist in Tokyo and the other is a..., not glossed
- 蒸し暑い (mushiatsui) "Hot and humid", exercise, D. You are talking to your friends who are currently in the following places...
- マイナス (mainasu) "Minus", exercise, D. You are talking to your friends who are currently in the following places..., not glossed
- 地図 (chizu) "Map", reading passage, Trip to Japan, not glossed
- 次は (tsugi wa) "Next (stop), . . .", vocabulary list, Miscellaneous Public Transportation Terms
- まもなく (mamonaku) "Soon", example sentence, Announcements
- 発車する (hasshasuru) "To depart (a vehicle)", example sentence, Announcements
- 参る (mairu) "To come (humble/polite)", example sentence, Announcements
- 止まる (tomaru) "To stop (vehicle)", example sentence, Announcements
- 閉まる (shimaru) "To close", example sentence, Announcements
- 注意する (chūisuru) "To be careful; pay attention", example sentence, Announcements

### Chapter 13: Lesson 11: After the Vacation (66)

- つり (tsuri) "Fishing", vocabulary list, Nouns
- こちら (kochira) "This person (polite)", vocabulary list, Nouns
- つく (tsuku) "To tell (a lie)", vocabulary list, U-verbs
- おなか (onaka) "Stomach", vocabulary list, U-verbs
- すく (suku) "To become empty (of hunger)", vocabulary list, U-verbs
- やめる (yameru) "To quit", vocabulary list, Ru-verbs
- けんかする (kenkasuru) "To have a fight; to quarrel", vocabulary list, Irregular Verbs
- まあまあ (māmā) "Okay; so-so", vocabulary list, Adverbs and Other Expressions
- もっと (motto) "More", vocabulary list, Adverbs and Other Expressions
- そして (soshite) "And then", vocabulary list, Adverbs and Other Expressions
- だけ (dake) "Just . . . ; only . . .", vocabulary list, Adverbs and Other Expressions
- どう (dō) "How", dialogue, I
- すごく (sugoku) "Really; extremely", dialogue, I
- 初めまして (hajimemashite) "How do you do", dialogue, II
- どこ (doko) "Where", dialogue, Ⅲ
- そうですか (sō desu ka) "Is that so?", dialogue, Ⅲ
- きれい (kirei) "Pretty; clean", dialogue, Ⅲ
- おいしい (oishii) "Delicious", dialogue, Ⅲ
- ぜひ (zehi) "By all means; definitely", dialogue, Ⅲ
- いつか (itsuka) "Someday", example sentence, 1 〜たい (tai)
- チベット (chibetto) "Tibet", example sentence, 1 〜たい (tai)
- ヨーロッパ (yōroppa) "Europe", example sentence, 3 〜ことがある (koto ga aru)
- はい (hai) "Yes", example sentence, 3 〜ことがある (koto ga aru)
- 南極 (nankyoku) "Antarctica", example sentence, 4 Noun A や (ya) Noun B
- もう (mō) "Already", example sentence, 4 Noun A や (ya) Noun B
- まだ (mada) "Not yet", example sentence, 4 Noun A や (ya) Noun B
- 一回 (ikkai) "One time", example sentence, だけ (dake)
- 三十分 (sanjuppun) "Thirty minutes", example sentence, だけ (dake)
- おみやげ (omiyage) "Souvenir", example sentence, Expression Notes
- 絵葉書 (ehagaki) "Postcard", example sentence, Expression Notes
- たくさん (takusan) "A lot; many", example sentence, には (ni wa)
- さっき (sakki) "A little while ago; just now", exercise, B. Pair Work: Ask if your partner wants to do the things above. When you...
- いちばん (ichiban) "The most; best", exercise, E. Pair Work: Ask your partner the following questions and report the answers...
- だれ (dare) "Who", exercise, E. Pair Work: Ask your partner the following questions and report the answers...
- いじわる (ijiwaru) "Mean; unkind", exercise, F. Complete the following sentences.
- それから (sorekara) "After that; then", exercise, B. Pair Work: Look at the picture and talk about what you want to do during the...
- あした (ashita) "Tomorrow", exercise, C. Pair Work: Ask your partner the following questions. When you answer, use...
- 冬休み (fuyuyasumi) "Winter vacation", exercise, C. Pair Work: Ask your partner the following questions. When you answer, use...
- 夏休み (natsuyasumi) "Summer vacation", exercise, C. Pair Work: Ask your partner the following questions. When you answer, use...
- きらい (kirai) "Disliked; hated", exercise, C. Pair Work: Ask your partner the following questions. When you answer, use...
- ラブレター (raburetā) "Love letter", exercise, A. The following are what John has or hasn’t done. Make the sentences using...
- ええ (ē) "Yeah; yes", exercise, B. Pair Work: Make questions using 〜ことがある (and) ask your partner. Continue your...
- ふぐ (fugu) "Blowfish (fugu)", exercise, B. Pair Work: Make questions using 〜ことがある (and) ask your partner. Continue your...
- 中国語 (chūgokugo) "Chinese language", exercise, B. Pair Work: Make questions using 〜ことがある (and) ask your partner. Continue your...
- 日本料理 (nihonryōri) "Japanese cuisine", exercise, B. Pair Work: Make questions using 〜ことがある (and) ask your partner. Continue your...
- すし (sushi) "Sushi", exercise, Ⅳ すしや (sushi ya) 天ぷらをよく (tempura o yoku) 食べます (tabe masu) Grammar 4
- よく (yoku) "Often", exercise, Ⅳ すしや (sushi ya) 天ぷらをよく (tempura o yoku) 食べます (tabe masu) Grammar 4
- どんな (donna) "What kind of", exercise, Ⅳ すしや (sushi ya) 天ぷらをよく (tempura o yoku) 食べます (tabe masu) Grammar 4
- ヒーロー (hīrō) "Hero", exercise, B. Class Activity: Find someone who . . .
- とても (totemo) "Very", exercise, C. Class Activity: Bring pictures of your hometown and describe it.
- にぎやか (nigiyaka) "Lively; bustling", exercise, C. Class Activity: Bring pictures of your hometown and describe it.
- 劇場 (gekijō) "Theater", exercise, C. Class Activity: Bring pictures of your hometown and describe it.
- ミュージカル (myūjikaru) "Musical (show)", exercise, C. Class Activity: Bring pictures of your hometown and describe it.
- だめ (dame) "No good", other, Expressions
- となり (tonari) "Next to; neighbor", other, Expressions
- これ (kore) "This (thing)", other, Expressions
- しめきり (shimekiri) "Deadline", vocabulary list, Vocabulary
- 答え (kotae) "Answer", vocabulary list, Vocabulary
- かっこ (kakko) "Parentheses ( )", vocabulary list, Vocabulary
- まる (maru) "Circle (○, correct)", vocabulary list, Vocabulary
- ばつ (batsu) "X mark (✕, wrong)", vocabulary list, Vocabulary
- くだけた言い方 (kudake ta ii kata) "Colloquial expression", vocabulary list, Vocabulary
- かたい言い方 (katai ii kata) "Bookish expression", vocabulary list, Vocabulary
- ていねいな言い方 (teinei na ii kata) "Polite expression", vocabulary list, Vocabulary
- ほかに (hokani) "Anything else; in addition", vocabulary list, Vocabulary
- 二人ずつ (futari zutsu) "Two people each", vocabulary list, Vocabulary

### Chapter 14: Lesson 12: Feeling Sick (21)

- おなか (onaka) "Stomach", vocabulary list, Nouns
- なくす (nakusu) "To lose", vocabulary list, U-verbs
- 元気がない (genki ga nai) "Don't look well", vocabulary list, Adverbs and Other Expressions
- できるだけ (dekirudake) "As much as possible", vocabulary list, Adverbs and Other Expressions
- それに (soreni) "Moreover", vocabulary list, Adverbs and Other Expressions
- うーん (ūn) "Um... (hesitation)", dialogue, Ⅰ Mary and Yui are talking at school.
- いじわる (ijiwaru) "Mean; unkind", example sentence, 4 〜ので (node), not glossed
- 靴 (kutsu) "Shoes", exercise, B. Respond to the comments using 〜んです (n desu)., not glossed
- かばん (kaban) "Bag", exercise, B. Respond to the comments using 〜んです (n desu)., not glossed
- かっこいい (kakkoii) "Cool; good-looking", exercise, B. Respond to the comments using 〜んです (n desu)., not glossed
- やせる (yaseru) "To lose weight; to become thin", exercise, B. Pair Work: Give advice to your partner in the following situations, using..., not glossed
- けんか (kenka) "Quarrel; fight", exercise, B. Pair Work: Give advice to your partner in the following situations, using..., not glossed
- 厳しい (kibishii) "Strict", exercise, A., not glossed
- アニメ (anime) "Animation; anime", exercise, A.
- 台風 (taifuu) "Typhoon", culture note, 日本の (nippon no) 気候 (kikō) The Japanese Climate
- 保険証 (hokenshō) "Health insurance certificate", dialogue, At the Clinic's Reception
- 見せる (miseru) "To show", dialogue, At the Clinic's Reception, not glossed
- 痛み止め (itamidome) "Painkiller", dialogue, At the Clinic's Reception
- 食後 (shokugo) "After a meal", dialogue, At the Clinic's Reception
- めまい (memai) "Dizziness", vocabulary list, Expressions for Illness（ 病気 (byōki) ）and Injuries（けが (kega)）
- けが (kega) "Injury", vocabulary list, Expressions for Illness（ 病気 (byōki) ）and Injuries（けが (kega)）

### Chapter 15: Reading and Writing 1: Hiragana (27)

- いちご (ichigo) "Strawberry", exercise, C. Listen to the recording and add diacritical marks ゛ (and) ゜ (to) the hiragana...
- だんご (dango) "Dumpling", exercise, C. Listen to the recording and add diacritical marks ゛ (and) ゜ (to) the hiragana...
- ざぶとん (zabuton) "Cushion", exercise, C. Listen to the recording and add diacritical marks ゛ (and) ゜ (to) the hiragana...
- がいこくじん (gaikokujin) "Foreigner", exercise, C. Listen to the recording and add diacritical marks ゛ (and) ゜ (to) the hiragana...
- たんぽぽ (tampopo) "Dandelion", exercise, C. Listen to the recording and add diacritical marks ゛ (and) ゜ (to) the hiragana...
- がんぺき (gampeki) "Cliff", exercise, C. Listen to the recording and add diacritical marks ゛ (and) ゜ (to) the hiragana...
- しゃしん (shashin) "Photograph", exercise, D. Listen to the recording and circle the matching hiragana word. Y01-4
- どくしょ (dokusho) "Reading", exercise, D. Listen to the recording and circle the matching hiragana word. Y01-4
- きょり (kyori) "Distance", exercise, D. Listen to the recording and circle the matching hiragana word. Y01-4
- ひやす (hiyasu) "To chill (something)", exercise, D. Listen to the recording and circle the matching hiragana word. Y01-4
- ちゃいろ (chairo) "Brown", exercise, D. Listen to the recording and circle the matching hiragana word. Y01-4
- おんなのひと (onna no hito) "Woman", exercise, D. Listen to the recording and circle the matching hiragana word. Y01-4
- きって (kitte) "Stamp", exercise, D. Listen to the recording and circle the matching hiragana word. Y01-4
- もっと (motto) "More", exercise, D. Listen to the recording and circle the matching hiragana word. Y01-4
- おばさん (obasan) "Aunt", exercise, E. Read the following pairs, paying attention to the long vowels. Y01-5
- おばあさん (obāsan) "Grandmother", exercise, E. Read the following pairs, paying attention to the long vowels. Y01-5
- おじいさん (ojiisan) "Grandfather", exercise, E. Read the following pairs, paying attention to the long vowels. Y01-5
- おじさん (ojisan) "Uncle", exercise, E. Read the following pairs, paying attention to the long vowels. Y01-5
- おや (oya) "Parent", exercise, E. Read the following pairs, paying attention to the long vowels. Y01-5
- おおや (ōya) "Landlord", exercise, E. Read the following pairs, paying attention to the long vowels. Y01-5
- せいき (seiki) "Century", exercise, E. Read the following pairs, paying attention to the long vowels. Y01-5
- かいしゃいん (kaishain) "Office worker", reading passage, Ⅱ Reading Practice
- だいがくいんせい (daigakuinsei) "Graduate student", reading passage, Ⅱ Reading Practice, not glossed
- けいざい (keizai) "Economics", reading passage, Ⅱ Reading Practice, not glossed
- なまえ (namae) "Name", reading passage, Ⅱ Reading Practice, not glossed
- さんねんせい (sannensei) "Third-year student", reading passage, Ⅱ Reading Practice, not glossed
- えいご (eigo) "English (language)", reading passage, Ⅲ Writing Practice, not glossed

### Chapter 16: Reading and Writing 2: Katakana (6)

- これ (kore) "This", reading passage, Ⅱ Reading Practice, not glossed
- じてんしゃ (jitensha) "Bicycle", reading passage, Ⅱ Reading Practice, not glossed
- たかい (takai) "Expensive; high", reading passage, Ⅱ Reading Practice, not glossed
- ほん (hon) "Book", reading passage, Ⅱ Reading Practice, not glossed
- フランスご (furansugo) "French (language)", reading passage, Ⅱ Reading Practice, not glossed
- くつ (kutsu) "Shoes", reading passage, Ⅱ Reading Practice, not glossed

### Chapter 17: Reading and Writing 3: Daily Life (18)

- チョコレート (chokorēto) "Chocolate", exercise, A. Read the price of the following items in kanji and write it in numerals., not glossed
- ハンカチ (hankachi) "Handkerchief", exercise, A. Read the price of the following items in kanji and write it in numerals., not glossed
- せんす (sensu) "Folding fan", exercise, A. Read the price of the following items in kanji and write it in numerals., not glossed
- いえ (ie) "House", exercise, A. Read the price of the following items in kanji and write it in numerals., not glossed
- まいにち (mainichi) "Every day", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- おきる (okiru) "To get up", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- うち (uchi) "Home", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- あさごはん (asagohan) "Breakfast", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- たべる (taberu) "To eat", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- いく (iku) "To go", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- べんきょうする (benkyōsuru) "To study", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- ひるごはん (hirugohan) "Lunch", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- のむ (nomu) "To drink", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- ほん (hon) "Book", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- よむ (yomu) "To read", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- かえる (kaeru) "To go home; return", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- みる (miru) "To watch; see", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed
- ねる (neru) "To sleep", reading passage, Ⅱ まいにちのせいかつ (mai ni chino sei katsu), not glossed

### Chapter 18: Reading and Writing 4: Mary's Weekend (19)

- ビル (biru) "Building", exercise, B. Look at the picture and choose the appropriate kanji for the blanks.
- おかあさん (okāsan) "Mother", exercise, II おかあさんへのメモ (okāsan e no memo), not glossed
- メモ (memo) "Memo; note", exercise, II おかあさんへのメモ (okāsan e no memo), not glossed
- なに (nani) "What", exercise, II おかあさんへのメモ (okāsan e no memo), not glossed
- きょう (kyō) "Today", exercise, II おかあさんへのメモ (okāsan e no memo), not glossed
- する (suru) "To do", exercise, II おかあさんへのメモ (okāsan e no memo), not glossed
- うち (uchi) "Home", exercise, II おかあさんへのメモ (okāsan e no memo), not glossed
- ばんごはん (bangohan) "Dinner", exercise, II おかあさんへのメモ (okāsan e no memo), not glossed
- 九時半 (kujihan) "Half past nine", reading passage, II おかあさんへのメモ (okāsan e no memo), not glossed
- こうえん (kōen) "Park", reading passage, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu), not glossed
- それから (sorekara) "And then", reading passage, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu), not glossed
- たくさん (takusan) "A lot; many", reading passage, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu), not glossed
- おてら (otera) "Temple", reading passage, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu), not glossed
- みせ (mise) "Shop; store", vocabulary list, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu)
- おまんじゅう (omanjuu) "Sweet bun", vocabulary list, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu)
- おそく (osoku) "Late (in doing something)", vocabulary list, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu)
- あさ (asa) "Morning", reading passage, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu), not glossed
- ざっし (zasshi) "Magazine", reading passage, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu), not glossed
- ひるごはん (hirugohan) "Lunch", reading passage, Ⅲ メアリーさんのしゅうまつ (mearī san no shū matsu), not glossed

### Chapter 19: Reading and Writing 5: Travel (29)

- えいが (eiga) "Movie", exercise, B. Match the following sentences with the pictures., not glossed
- いる (iru) "To be; to exist (people, animals)", exercise, B. Match the following sentences with the pictures., not glossed
- さむい (samui) "Cold (weather)", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- きれい (kirei) "Pretty; beautiful", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- まち (machi) "Town; city", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- おしろ (oshiro) "Castle", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×...
- ふるい (furui) "Old", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- たくさん (takusan) "A lot; many", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- しゃしん (shashin) "Photograph", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- よる (yoru) "Night", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×...
- まいにち (mainichi) "Every day", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- すごく (sugoku) "Very; extremely", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- おいしい (oishii) "Delicious", reading passage, B. Read Moe's post below. Write ○ for the things she did or does and write ×..., not glossed
- どこ (doko) "Where", exercise, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- どんな (donna) "What kind of", exercise, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- なに (nani) "What", exercise, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- だれ (dare) "Who", exercise, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- きのう (kinō) "Yesterday", exercise, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- する (suru) "To do", exercise, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- おかあさん (okāsan) "Mother", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- あつい (atsui) "Hot (weather)", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- いっしょに (isshoni) "Together", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- うみ (umi) "Sea; ocean", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- およぐ (oyogu) "To swim", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- メキシコ人 (mekishikojin) "Mexican (person)", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- たいへん (taihen) "Tough", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly)
- たのしい (tanoshii) "Fun; enjoyable", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- だいすき (daisuki) "Very much liked; favorite", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly), not glossed
- さま (sama) "Mr./Ms. (used in letter writing)", reading passage, C. Robert's postcard (unheaded in the source, follows Ⅱ B directly)

### Chapter 20: Reading and Writing 6: My Favorite Restaurant (36)

- 一生に一度 (isshi youniichido) "Once in a lifetime", kanji table, 私のすきなレストラン (watashi no suki na resutoran) My Favorite Restaurant
- 韓国 (kankoku) "South Korea", kanji table, 私のすきなレストラン (watashi no suki na resutoran) My Favorite Restaurant
- 近い (chika) "Near", exercise, I 漢字の練習 (kanji no renshū) (Kanji Practice), not glossed
- うち (uchi) "House", exercise, I 漢字の練習 (kanji no renshū) (Kanji Practice), not glossed
- こうえん (kōen) "Park", exercise, I 漢字の練習 (kanji no renshū) (Kanji Practice), not glossed
- プログラム (puroguramu) "Program", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- まち (machi) "Town", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- する (suru) "To do", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- きれい (kirei) "Pretty; beautiful", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- えいご (eigo) "English (language)", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- おしえる (oshieru) "To teach", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- セール (sēru) "Sale", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- じてんしゃ (jitensha) "Bicycle", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- あたらしい (atarashii) "New", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- よる (yoru) "Night; evening", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- ところ (tokoro) "Place", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- じかん (jikan) "Time", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- つれる (tsureru) "To bring; take along (a person)", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- もつ (motsu) "To have; to hold; to carry", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- イタリアンレストラン (itarianresutoran) "Italian restaurant", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- ランチ (ranchi) "Lunch", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- セット (setto) "Set (meal)", other, II でんごんばん (den go n ban) (Bulletin Board), not glossed
- すき (suki) "Fond of; favorite", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- いつも (itsumo) "Always", vocabulary list, 私のすきなレストラン (watashi no suki na resutoran)
- みなさん (minasan) "Everyone", vocabulary list, 私のすきなレストラン (watashi no suki na resutoran)
- ちいさい (chiisai) "Small", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- とても (totemo) "Very", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- おもしろい (omoshiroi) "Interesting; funny", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- おいしい (oishii) "Delicious", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- よく (yoku) "Often", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- ここ (koko) "Here", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- たくさん (takusan) "A lot; many", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- やすい (yasui) "Cheap", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- くる (kuru) "To come", reading passage, 私のすきなレストラン (watashi no suki na resutoran), not glossed
- たかい (takai) "Expensive", exercise, C. Choose the correct answer., not glossed
- つまらない (tsumaranai) "Boring", exercise, C. Choose the correct answer., not glossed

### Chapter 21: Reading and Writing 7: Mary's Letter (32)

- あつい (atsui) "Hot (weather)", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- さむい (samui) "Cold (weather)", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- かぞく (kazoku) "Family", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- ちかく (chikaku) "Near; vicinity", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- すむ (sumu) "To live (reside)", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- ここ (koko) "Here", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- しずか (shizuka) "Quiet", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- まち (machi) "Town", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- とても (totemo) "Very", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- しんせつ (shinsetsu) "Kind (to people)", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- たのしい (tanoshii) "Fun; enjoyable", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- はたらく (hataraku) "To work", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- いそがしい (isogashii) "Busy", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- おそい (osoi) "Late", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- おもしろい (omoshiroi) "Interesting; funny", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- いっしょに (isshoni) "Together", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- よく (yoku) "Often; well", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- はなす (hanasu) "To speak", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- いもうと (imōto) "Younger sister", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- らいねん (rainen) "Next year", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- べんきょうする (benkyōsuru) "To study", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- すぐ (sugu) "Immediately; right away", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- たいへん (taihen) "Tough; difficult", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- おにいさん (oniisan) "Older brother", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- あまり (amari) "Not very; not much", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- いつ (itsu) "When", reading passage, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed
- すこし (sukoshi) "A little", vocabulary list, Ⅱ メアリーさんのてがみ (mearī san no te ga mi)
- みんな (minna) "All", vocabulary list, Ⅱ メアリーさんのてがみ (mearī san no te ga mi)
- じゅく (juku) "Cram school", vocabulary list, Ⅱ メアリーさんのてがみ (mearī san no te ga mi)
- とる (toru) "To take (a class)", vocabulary list, Ⅱ メアリーさんのてがみ (mearī san no te ga mi)
- たのしみにする (tanoshimi ni suru) "To look forward (to)", vocabulary list, Ⅱ メアリーさんのてがみ (mearī san no te ga mi)
- からだ (karada) "Body", vocabulary list, Ⅱ メアリーさんのてがみ (mearī san no te ga mi), not glossed

### Chapter 22: Reading and Writing 8: Japanese Office Workers (18)

- 新鮮 (shinsen) "Fresh", kanji table, 第 (dai)8課 (ka) LESSON 8 日本の会社 (nippon no kaisha) 員 (in) Japanese Office Workers
- 不思議 (fushigi) "Mysterious", kanji table, 第 (dai)8課 (ka) LESSON 8 日本の会社 (nippon no kaisha) 員 (in) Japanese Office Workers
- おもしろい (omoshiroi) "Interesting", exercise, B. Match the following phrases with an appropriate verb., not glossed
- のる (noru) "To ride", exercise, B. Match the following phrases with an appropriate verb., not glossed
- する (suru) "To do", exercise, B. Match the following phrases with an appropriate verb., not glossed
- 最後 (saigo) "Last; end", vocabulary list, 1 日本の会社員 (nippon no kaisha in)
- みんな (minna) "Everyone", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- とても (totemo) "Very", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- すぐ (sugu) "Immediately; right away", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- いる (iru) "To be; to exist (living things)", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- たくさん (takusan) "A lot; many", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- だから (dakara) "So; therefore", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- あまり (amari) "Not much (with negative)", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- よく (yoku) "Often", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- はい (hai) "Yes", reading passage, 1 日本の会社員 (nippon no kaisha in), not glossed
- だれ (dare) "Who", exercise, 1 日本の会社員 (nippon no kaisha in), not glossed
- どう (dō) "How", exercise, 1 日本の会社員 (nippon no kaisha in), not glossed
- あなた (anata) "You", exercise, 1 日本の会社員 (nippon no kaisha in), not glossed

### Chapter 23: Reading and Writing 9: Sora's Diary (24)

- する (suru) "To do", vocabulary list, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- そして (soshite) "And then", vocabulary list, Ⅱ ソラさんの日記 (sora san no nikki)
- ごちそう (gochisō) "Excellent food", vocabulary list, Ⅱ ソラさんの日記 (sora san no nikki)
- ふる (furu) "To fall (rain)", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- せ (se) "Height; stature", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- やせる (yaseru) "To be thin", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- たくさん (takusan) "A lot; many", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- おいしい (oishii) "Delicious", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- すごく (sugoku) "Very (casual)", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- きれい (kirei) "Pretty; clean", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- もらう (morau) "To receive", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- しんせつ (shinsetsu) "Kind", reading passage, Ⅱ ソラさんの日記 (sora san no nikki), not glossed
- ひくい (hikui) "Low; short (height)", exercise, B. Make each of the following statements with 〇 if true, or with × if false., not glossed
- ありがとうございました (arigatō gozai mashi ta) "Thank you", dialogue, C. ソラさんはメアリーさんのホストファミリーにメールを書きました (sora san wa mearī san no hosutofamirī ni mēru o kaki mashi ta)。, not glossed
- きのう (kinō) "Yesterday", dialogue, C. ソラさんはメアリーさんのホストファミリーにメールを書きました (sora san wa mearī san no hosutofamirī ni mēru o kaki mashi ta)。, not glossed
- どうも (dōmo) "Very much (as an intensifier)", dialogue, C. ソラさんはメアリーさんのホストファミリーにメールを書きました (sora san wa mearī san no hosutofamirī ni mēru o kaki mashi ta)。, not glossed
- とても (totemo) "Very", dialogue, C. ソラさんはメアリーさんのホストファミリーにメールを書きました (sora san wa mearī san no hosutofamirī ni mēru o kaki mashi ta)。, not glossed
- あまり (amari) "Not very (with negative)", dialogue, C. ソラさんはメアリーさんのホストファミリーにメールを書きました (sora san wa mearī san no hosutofamirī ni mēru o kaki mashi ta)。, not glossed
- それから (sorekara) "After that", dialogue, C. ソラさんはメアリーさんのホストファミリーにメールを書きました (sora san wa mearī san no hosutofamirī ni mēru o kaki mashi ta)。, not glossed
- あそぶ (asobu) "To play; to visit for fun", dialogue, C. ソラさんはメアリーさんのホストファミリーにメールを書きました (sora san wa mearī san no hosutofamirī ni mēru o kaki mashi ta)。, not glossed
- あんないする (annaisuru) "To show someone around", vocabulary list, C. ソラさんはメアリーさんのホストファミリーにメールを書きました (sora san wa mearī san no hosutofamirī ni mēru o kaki mashi ta)。
- つける (tsukeru) "To attach; to pay attention", other, Useful Expressions:, not glossed
- 楽しみ (tanoshimi) "Looking forward to; enjoyment", other, Useful Expressions:, not glossed
- おせわになる (osewaninaru) "To be in someone's care; to receive kindness", other, Useful Expressions:, not glossed

### Chapter 24: Reading and Writing 10: The Folktale Kasajizo (23)

- すわる (suwaru) "To sit", exercise, B. Write each antonym in kanji., not glossed
- みじかい (mijikai) "Short", exercise, B. Write each antonym in kanji., not glossed
- かさ (kasa) "Bamboo hat", vocabulary list, Ⅱ かさじぞう (kasa ji zō)
- おもち (omochi) "Rice cake", vocabulary list, Ⅱ かさじぞう (kasa ji zō)
- かなしい (kanashii) "Sad", vocabulary list, Ⅱ かさじぞう (kasa ji zō)
- かぶせる (kabuseru) "To put (a hat) on someone's head", vocabulary list, Ⅱ かさじぞう (kasa ji zō)
- とる (toru) "To take off", vocabulary list, Ⅱ かさじぞう (kasa ji zō)
- いいこと (ii koto) "Good deed", vocabulary list, Ⅱ かさじぞう (kasa ji zō)
- しあわせ (shiawase) "Happy", vocabulary list, Ⅱ かさじぞう (kasa ji zō)
- おじいさん (ojiisan) "Old man; grandfather", dialogue, Ⅱ かさじぞう (kasa ji zō), not glossed
- おばあさん (obāsan) "Old woman; grandmother", exercise, A. Answer the following questions., not glossed
- 主人公 (shujinkō) "Main character(s)", exercise, A. Answer the following questions.
- どんな (donna) "What kind of", exercise, A. Answer the following questions., not glossed
- だれ (dare) "Who; anyone", exercise, D. Mark each of the following statements with ○ if true, or with × if false., not glossed
- とても (totemo) "Very", exercise, D. Mark each of the following statements with ○ if true, or with × if false., not glossed
- たくさん (takusan) "A lot; many", exercise, D. Mark each of the following statements with ○ if true, or with × if false., not glossed
- さむい (samui) "Cold", dialogue, かさじぞう (kasa ji zō), not glossed
- うち (uchi) "House; home", reading passage, かさじぞう (kasa ji zō), not glossed
- あした (ashita) "Tomorrow", reading passage, かさじぞう (kasa ji zō), not glossed
- はじまる (hajimaru) "To begin", reading passage, かさじぞう (kasa ji zō), not glossed
- でも (demo) "But; however", reading passage, かさじぞう (kasa ji zō), not glossed
- ふる (furu) "To fall (rain or snow)", reading passage, かさじぞう (kasa ji zō), not glossed
- ディーワーリー (dīwārī) "Diwali", vocabulary list, Ⅲ 書く (kaku) 練習 (renshū), not glossed

### Chapter 25: Reading and Writing 11: Looking for Friends/Members (18)

- いろいろな (iroirona) "Various", kanji table, 友だち・メンバー募集 (tomodachi ･ membā boshū) Looking for Friends/Members, not glossed
- あなた (anata) "You", exercise, A. 質問に答えてください (shitsumon ni kotae te kudasai)。(Answer the following questions.), not glossed
- いっしょに (isshoni) "Together", reading passage, いっしょにボランティアをしませんか (issho ni borantia o shi mase n ka), not glossed
- バイト (baito) "Part-time job", reading passage, 映画について話しませんか (eiga nitsuite hanashi mase n ka)？, not glossed
- いつも (itsumo) "Always", reading passage, 映画について話しませんか (eiga nitsuite hanashi mase n ka)？, not glossed
- ロック (rokku) "Rock (music)", reading passage, いっしょにバンドをやりませんか (issho ni bando o yari mase n ka), not glossed
- それから (sorekara) "And then; after that", reading passage, いっしょにバンドをやりませんか (issho ni bando o yari mase n ka), not glossed
- どの (dono) "Which", exercise, D. 質問に答えてください (shitsumon ni kotae te kudasai)。, not glossed
- どうして (dōshite) "Why", exercise, D. 質問に答えてください (shitsumon ni kotae te kudasai)。, not glossed
- これから (korekara) "From now on", vocabulary list, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2
- こと (koto) "Things; matters", vocabulary list, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2
- つり (tsuri) "Fishing", reading passage, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2, not glossed
- まだ (mada) "Not yet; still", reading passage, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2, not glossed
- あまり (amari) "Not very (much)", reading passage, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2, not glossed
- つもり (tsumori) "Intention (to do something)", reading passage, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2, not glossed
- たくさん (takusan) "A lot; many", reading passage, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2, not glossed
- いつ (itsu) "When", exercise, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2, not glossed
- どこ (doko) "Where", exercise, E. 「友だち・メンバー募集 (tomodachi ･ membā boshū)」を見て (o mi te)、エバさんはゆうさんにメッセージを書きました (eba san wa yū san ni messēji o kaki mashi ta)。メッセージを読んで (messēji o yon de)、質問に答えてください (shitsumon ni kotae te kudasai)。 Y11-2, not glossed

### Chapter 26: Reading and Writing 12: Tanabata Festival (9)

- まじめ (majime) "Serious; sober; diligent", vocabulary list, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12
- ある (aru) "A certain (one)", vocabulary list, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12
- 連れて帰る (tsuretekaeru) "To bring (a person) back", vocabulary list, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12
- かわいそう (kawaisō) "Pitiful", vocabulary list, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12
- までに (madeni) "By (a certain time)", vocabulary list, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12
- かなう (kanau) "To be realized", vocabulary list, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12
- など (nado) "And so forth", vocabulary list, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12
- たんざく (tanzaku) "Strip of fancy paper", vocabulary list, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12
- 七夕 (tanabata) "Tanabata (star festival)", reading passage, B. 七夕の話を読みましょう (tanabata no hanashi o yomi mashō)。 Y12, not glossed
