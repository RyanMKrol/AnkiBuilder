#!/usr/bin/env bash
# Does any card teach a name the book itself calls fictitious?
#
# The book labels its invented businesses in its own text -- "(fictitious hotel name)" -- so this is
# a deterministic check for THIS publisher, and only for it. On a book that does not label them the
# declared set is empty, and an empty result here means "this book does not say", never "clean".
# That is why it is a script you run deliberately and not a preflight check: the rule it enforces
# lives in docs/card-rules-shared.md, where every card-writing pass gets it.
#
# The rule it backs is "A proper name is not a card" in docs/card-rules-shared.md.
set -euo pipefail

node -e '
const {readFileSync,readdirSync}=require("fs");
const H=".anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters";
const B="output/epubs/japanese-for-busy-people-book-1-kana";
const fict=new Set();
for (const f of readdirSync(H)) {
  const t=readFileSync(H+"/"+f,"utf8").replace(/<[^>]+>/g," ");
  for (const m of t.matchAll(/(\S{2,20})\s+[A-Z][^()]{0,30}?\s*\(fictitious/g)) fict.add(m[1]);
}
let bad=0;
for (const d of readdirSync(B)) {
  let c; try { c=JSON.parse(readFileSync(B+"/"+d+"/cards.json","utf8")); } catch { continue; }
  for (const i of c.items) if (!i.excluded && fict.has((i.target||"").trim())) { bad++; console.log("  SHIPPING:",d,i.id,i.target); }
}
console.log(fict.size+" fictitious names declared by the book; "+bad+" shipping as cards");
'
