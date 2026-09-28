# Data in this folder

`kanjidic2-compact.json` is derived from **KANJIDIC2**, the property of the Electronic Dictionary
Research and Development Group (EDRDG), used in conformance with the Group's licence: Creative
Commons Attribution-ShareAlike 4.0 (https://www.edrdg.org/edrdg/licence.html). It was converted
from the JSON edition published by the jmdict-simplified project
(https://github.com/scriptin/jmdict-simplified). Only the graded kanji (the jōyō and jinmeiyō sets)
are kept, with their English meanings, on and kun readings, grade and frequency. This derived file
is shared under the same licence. Rebuild it with `node scripts/build-kanji-dictionary.mjs`.

`joyo-readings.json` is the official school reading list, the 常用漢字表 (Jōyō Kanji Table, Cabinet
Notice, 2010), as reproduced in English Wikipedia's "List of jōyō kanji"
(https://en.wikipedia.org/wiki/List_of_j%C5%8Dy%C5%8D_kanji), whose text is licensed under Creative
Commons Attribution-ShareAlike 4.0. Only each kanji's readings and short English gloss are kept;
special and narrow-use readings (bracketed in the official table) are left out unless a kanji has no
other. This derived file is shared under the same licence. Rebuild it with
`node scripts/build-joyo-readings.mjs`.
