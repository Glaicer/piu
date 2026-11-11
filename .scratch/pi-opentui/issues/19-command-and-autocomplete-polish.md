# 19: Polish: commands, autocomplete, state and focus

**What to build:** Small user-visible gaps left by tickets 09–15. A refused model or reasoning switch says why instead of closing the picker silently. Autocomplete behaves with mixed case and with the cursor inside a word. Tree opens on the current position. App commands receive the text after their name, so `/compact <instructions>` works. The shown conversation, model and reasoning level stay in sync when Pi changes them on its own, and a failing Pi extension is reported instead of ignored. The input keeps keyboard focus: a mouse click never takes it away, and Esc aborts a run wherever focus is. The question card stays usable in a short terminal, and Tab stops only where keys do something.

**Blocked by:** 09, 10, 11, 12, 13, 14, 15

**Status:** done

- [x] When `set_model` or `set_thinking_level` answers `success: false`, a Toast shows Pi's error and the shown value stays unchanged
- [x] `/MODEL` + Enter runs `/model` (command matching is case-insensitive, like the list filter)
- [x] Completing with the cursor inside a word (`/mo|del`) replaces the whole word, leaving no tail
- [x] The Tree Modal opens with the current leaf's prompt selected
- [x] After an automatic compaction (`compaction_end` with reason `threshold` or `overflow`), the message list matches Pi's `get_messages`, as it already does after `/compact`
- [x] A test Pi extension command that changes the thinking level updates the shown level (`thinking_level_changed`), and one that changes the model updates the shown model once the command finishes
- [x] An `extension_error` event shows a Toast naming the Pi extension and its error
- [x] Clicking the chat, a tool card, a Thinking label, the model or reasoning Module or the status line leaves keyboard focus in the input: text typed right after the click lands in the input, and the click still does what it does today (toggle, open a picker). Clicking a text field, such as the question card's custom answer, focuses that field
- [x] With focus moved by Tab to a Panel that has no text field, a printable key moves focus to the input and the character lands there
- [x] Esc while the agent works aborts (clearing and restoring the queue as today) whichever Panel has focus. An open Modal, autocomplete list or question card still takes Esc first
- [x] In a terminal shorter than the question card, the card is capped to the space left and scrolls, and the cursor row and Submit can be reached and seen
- [x] Tab and Shift+Tab skip a Panel where keys do nothing (the default `status` Panel)
- [x] `/compact focus on the tests` passes `focus on the tests` to Pi's compaction as custom instructions, and the command's `run` receives the argument text

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

**Implementation (deviations and notes):**

- `set_thinking_level` never answers `success: false` in Pi's RPC (`rpc-mode.js` always succeeds), so only the refused model switch has a test (a missing model, "Model not found"); `setThinkingLevel` uses the same Toast path untested.
- The Toast for `extension_error` names the Pi extension by its file name without extension (`index` shows the folder name instead), e.g. `faux-backend: hook exploded`. `extension_error` is not in Pi's exported types, so `ExtensionErrorRecord` is declared in `src/backend.ts`.
- `compaction_end` with a result reloads `get_messages` for every reason, including `/compact`, which no longer reloads on its own. A reload that meets a running stream waits for `agent_settled`, because a `get_messages` reply cannot say whether the stream began before it was made.
- The model refresh after a Pi extension command runs when the `prompt` response says `disposition: "handled"` (Pi answers it only after the command's handler returns).
- Esc while working with the focus on a Panel that has no text field moves the focus to the input and lets the key through, so the prompt's own Esc handler aborts and restores the queue. The focus stays in the input afterwards.
- A printable key does the same. The target is the last text field that held focus, if it is still shown.
- A Panel is a Tab stop if it has a focusable inside, a shown Module that registered `onKey`, or content longer than itself (a scrollbox that scrolls on arrow keys). `status` has none of these, so it is skipped.
- Clicks: one `onMouseDown` on the app root calls `preventDefault` unless the nearest focusable ancestor of the target is a text field.
- Question card in a short terminal: a `"content"` slot is capped at the terminal size minus 2 (`maxHeight`/`maxWidth` in `SlotView`), and a `"content"` Panel inside a `"content"` container shrinks (`flexShrink: 1`). Yoga's shrink split between two flexible siblings with a fractional `flexShrink` was unreliable, hence the explicit cap. A `"content"` Panel directly under a `"rest"` sibling still does not shrink. The card clips its rows in a box and scrolls it with `translateY` (a `<scrollbox>` collapses to nothing inside a Panel sized to its content). It needs about 6 rows of terminal: the agent Panel keeps its two border rows, the status Panel three, and the card's own Panel two.
