# 19: Polish: commands, autocomplete, state and focus

**What to build:** Small user-visible gaps left by tickets 09–15. A refused model or reasoning switch says why instead of closing the picker silently. Autocomplete behaves with mixed case and with the cursor inside a word. Tree opens on the current position. App commands receive the text after their name, so `/compact <instructions>` works. The shown conversation, model and reasoning level stay in sync when Pi changes them on its own, and a failing Pi extension is reported instead of ignored. The input keeps keyboard focus: a mouse click never takes it away, and Esc aborts a run wherever focus is. The question card stays usable in a short terminal, and Tab stops only where keys do something.

**Blocked by:** 09, 10, 11, 12, 13, 14, 15

**Status:** ready-for-agent

- [ ] When `set_model` or `set_thinking_level` answers `success: false`, a Toast shows Pi's error and the shown value stays unchanged
- [ ] `/MODEL` + Enter runs `/model` (command matching is case-insensitive, like the list filter)
- [ ] Completing with the cursor inside a word (`/mo|del`) replaces the whole word, leaving no tail
- [ ] The Tree Modal opens with the current leaf's prompt selected
- [ ] After an automatic compaction (`compaction_end` with reason `threshold` or `overflow`), the message list matches Pi's `get_messages`, as it already does after `/compact`
- [ ] A test Pi extension command that changes the thinking level updates the shown level (`thinking_level_changed`), and one that changes the model updates the shown model once the command finishes
- [ ] An `extension_error` event shows a Toast naming the Pi extension and its error
- [ ] Clicking the chat, a tool card, a Thinking label, the model or reasoning Module or the status line leaves keyboard focus in the input: text typed right after the click lands in the input, and the click still does what it does today (toggle, open a picker). Clicking a text field, such as the question card's custom answer, focuses that field
- [ ] With focus moved by Tab to a Panel that has no text field, a printable key moves focus to the input and the character lands there
- [ ] Esc while the agent works aborts (clearing and restoring the queue as today) whichever Panel has focus. An open Modal, autocomplete list or question card still takes Esc first
- [ ] In a terminal shorter than the question card, the card is capped to the space left and scrolls, and the cursor row and Submit can be reached and seen
- [ ] Tab and Shift+Tab skip a Panel where keys do nothing (the default `status` Panel)
- [ ] `/compact focus on the tests` passes `focus on the tests` to Pi's compaction as custom instructions, and the command's `run` receives the argument text

## Comments

- From 09: `setModel` and `setThinkingLevel` in `src/pi-state.ts` ignore the response; only a dead Backend is caught.
- From 10: exact-match for Enter and local dispatch of app commands are case-sensitive, while matching is not. Completion with the cursor mid-word replaces only the text before the cursor.
- From 11: `get_tree` returns `leafId`, but the Modal starts on its first row. `run` gets no arguments, and the prompt dispatches an app command only for a bare `/name`.
- From 11: only `/compact` reloads `get_messages`; Compact's reload and service-row re-anchoring in `src/pi-state.ts` can be reused for `compaction_end` of any reason.
- From 09: Pi has `thinking_level_changed` but no model-change event (`docs/json.md`, Queue and state events), so the model has to be re-read with `get_state`, e.g. after a Backend command's prompt settles. The author's `/mode` Pi extension switches models, so this shows up in daily use. The store handles neither today.
- `extension_error` (`docs/json.md`, RPC-only events) carries `extensionPath`, `event` and `error`; the store ignores it today.
- From 15: a click focuses the clicked Panel (its scrollbox), shown by the focus indication, so typing after a click on the chat goes nowhere. The author checked other coding agents: none moves focus on a click, so the input keeps it. Modal-opening handlers already call `event.preventDefault()` on mouse-down to stop OpenTUI focusing the clicked focusable. Tab focus between Panels stays as built in 15.
- From 15: Esc aborts only while the prompt has focus. A Module's `onKey` fires only in scrollbox Panels, not in `"content"`-sized ones. The `status` Panel's Tab stop only shows focus.
- From 13/14: a `"content"`-sized Panel is a plain box and doesn't scroll (a scrollbox never shrinks to its content), so the card has no scrollbox or height cap and a short terminal clips it.
