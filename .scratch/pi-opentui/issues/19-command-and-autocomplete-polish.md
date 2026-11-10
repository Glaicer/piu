# 19: Command and autocomplete polish

**What to build:** Small user-visible gaps left by tickets 09–11. A refused model or reasoning switch says why instead of closing the picker silently. Autocomplete behaves with mixed case and with the cursor inside a word. Tree opens on the current position. App commands receive the text after their name, so `/compact <instructions>` works. Messages that Pi extensions add to the conversation (`role: "custom"` with `display: true`) show in the chat.

**Blocked by:** 09, 10, 11, 12

**Status:** ready-for-agent

- [ ] When `set_model` or `set_thinking_level` answers `success: false`, a Toast shows Pi's error and the shown value stays unchanged
- [ ] `/MODEL` + Enter runs `/model` (command matching is case-insensitive, like the list filter)
- [ ] Completing with the cursor inside a word (`/mo|del`) replaces the whole word, leaving no tail
- [ ] The Tree Modal opens with the current leaf's prompt selected
- [ ] A test Pi extension's `pi.sendMessage({ customType, content, display: true })` shows a card in the agent Panel with its type and text, in conversation order, both live and after loading the session with `-c`. With `display: false` nothing shows
- [ ] `/compact focus on the tests` passes `focus on the tests` to Pi's compaction as custom instructions, and the command's `run` receives the argument text

## Comments

- From 09: `setModel` and `setThinkingLevel` in `src/pi-state.ts` ignore the response; only a dead Backend is caught.
- From 10: exact-match for Enter and local dispatch of app commands are case-sensitive, while matching is not. Completion with the cursor mid-word replaces only the text before the cursor.
- From 11: `get_tree` returns `leafId`, but the Modal starts on its first row. `run` gets no arguments, and the prompt dispatches an app command only for a bare `/name`.
- Pi extensions on the author's machine that add such messages: `/in` (`~/.pi/agent/extensions/in.ts`) and the results of `@chthub/pi-subagents`. The chat Module renders only user and assistant messages today, so these vanish. The type is `CustomMessage` in `@earendil-works/pi-coding-agent/dist/core/messages.d.ts`; `content` is a string or text and image parts (images are out of scope, show text only).
