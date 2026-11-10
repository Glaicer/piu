# 14: Full question card

**What to build:** The question card handles everything the tool allows: several questions as tabs I can move between freely, multi-select toggles, a typed custom answer instead of options, and a review step listing all answers with Submit, where I can go back and change one before sending.

**Blocked by:** 13

**Status:** done

- [x] Three scripted questions show three tabs, and switching tabs keeps unsent choices
- [x] A multi-select question toggles several options, and the model receives all of them
- [x] Typing a custom answer sends it instead of an option
- [x] The review step lists every answer, and changing one from review is reflected in what the model receives
- [x] Every action is also reachable by keyboard

## Comments

- From 13: the Pi extension already sends every question (`{ v: 1, questions }`) and reads every answer (`{ answers: string[][] }`, one array of labels per question, `builtin/ask-user-question/protocol.ts`), so this ticket needs no channel change. The card (`builtin/ask-user-question/index.tsx`) shows only the first question as single-select, ignores `multiSelect`, and the Pi extension reports unanswered questions as `(not answered)`. A custom answer can travel as a plain string in that question's array.
- From 13: a content-sized Panel does not scroll, so a card taller than the space left (several questions, a review step, a short terminal) is clipped. Give the card its own scrollbox or a height cap if that happens.
- Done: the card is `builtin/ask-user-question/card.tsx` (state per question: chosen labels or a custom text, never both). It no longer uses `Picker`. Keys: Left/Right switch tabs (they belong to the text while typing, so Up leaves the field first). Tab and Shift+Tab are left free for ticket 15's Panel focus (story 86), Up/Down move the `▸` cursor, Space toggles a multi-select option, Enter picks a single-select option and moves on (a multi-select option only moves on), Esc dismisses everywhere, including inside the custom field. The last row of every question is a "Type your own answer" field: moving onto it focuses it, typing replaces any chosen options, and choosing an option clears the text. The Review tab lists every answer; Enter or a click on a row edits that question and returns to Review after the next Enter, and Submit sends. Mouse: clicking a tab, option, Review row, Submit or the field does the same.
- Deviation (boring default): a single question shows no tab bar and no Review step. Picking its option (or Enter on a multi-select one) submits at once, so ticket 13's one-question flow is unchanged.
- The old test "a question the card does not show yet reaches the model as not answered" is gone, because Enter now moves to the next tab. The `(not answered)` path is covered by submitting from Review with an unanswered question. The asked-state corner row in the Panel-growth test moved from 20 to 19, because the one-question card now has 6 rows (header, question, two options, the custom field, Dismiss).
- Enter on an empty custom field does nothing, so an empty answer is never sent by mistake. The custom field is created per question, so typed text stays with its own question.
- Not done: the card has no scrollbox or height cap. Four questions with four options and the custom row fit the default 30-row test terminal; a terminal shorter than the card still clips it (From 13).
- For ticket 15: the key map above is hard-coded in `card.tsx`.
