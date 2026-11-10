# 14: Full question card

**What to build:** The question card handles everything the tool allows: several questions as tabs I can move between freely, multi-select toggles, a typed custom answer instead of options, and a review step listing all answers with Submit, where I can go back and change one before sending.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] Three scripted questions show three tabs, and switching tabs keeps unsent choices
- [ ] A multi-select question toggles several options, and the model receives all of them
- [ ] Typing a custom answer sends it instead of an option
- [ ] The review step lists every answer, and changing one from review is reflected in what the model receives
- [ ] Every action is also reachable by keyboard

## Comments

- From 13: the Pi extension already sends every question (`{ v: 1, questions }`) and reads every answer (`{ answers: string[][] }`, one array of labels per question, `builtin/ask-user-question/protocol.ts`), so this ticket needs no channel change. The card (`builtin/ask-user-question/index.tsx`) shows only the first question as single-select, ignores `multiSelect`, and the Pi extension reports unanswered questions as `(not answered)`. A custom answer can travel as a plain string in that question's array.
- From 13: a content-sized Panel does not scroll, so a card taller than the space left (several questions, a review step, a short terminal) is clipped. Give the card its own scrollbox or a height cap if that happens.
