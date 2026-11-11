# 08: Input

**What to build:** The prompt input is multi-line (Enter sends, Shift+Enter inserts a newline) with history on Up/Down. While the agent works, Enter steers the current run, Alt+Enter queues a follow-up and Esc aborts. A working indicator is visible while the agent runs.

**Blocked by:** 01

**Status:** done

- [x] Shift+Enter creates a second line, and Enter sends both lines as one prompt that the faux model receives
- [x] After two prompts, Up recalls the second then the first, and Down goes back
- [x] During a slow scripted reply, Enter's text reaches the model as a steering message and Alt+Enter's text arrives after the run as a follow-up
- [x] Esc during a run stops it and the indicator disappears
- [x] The working indicator is shown during the run and gone after `agent_settled`

## Comments

Deviations from the ticket and decisions worth knowing:

- `PiState.working` is true from `agent_start` to `agent_settled` (not `agent_end`, which Pi follows with retries, compaction and queued messages). It is reset on Restart. `PiActions` gains `steer`, `followUp` and `abort`.
- `steer` and `followUp` send `prompt` with `streamingBehavior` instead of the `steer` / `follow_up` commands. Pi starts a run when idle and queues otherwise, so a message sent in the gap before `agent_start` arrives is not refused. Enter steers only while `working`; Alt+Enter always goes through `followUp`, so it starts a normal run when idle.
- The input is a `<textarea>` with its own key routing in `onKeyDown`, because its defaults are the reverse (Enter inserts a newline, Alt+Enter submits). Up and Down walk history only when the cursor is on the first or last visual line, otherwise they move the cursor. The unsent draft comes back after the newest entry. History is in memory only: it is empty after a Restart or a new `piu` launch.
- The default Layout's input Panel grows from 3 to 5 rows (the input-area Container from 6 to 8): a row for the working indicator plus two text lines. The prompt Module needs at least 4 rows, so the focus test in `test/layout.test.ts` that places it in a Panel now gives that Panel 4.
- The working indicator is static text ("Working…") in the prompt Module; ticket 16 animates it. Replacing the input Module drops the indicator with it.
- Test support: the faux model expands `{lastUser}` to the JSON-encoded text of the last user message, which is how a test sees what the model received. The test renderer enables the kitty keyboard protocol (the real renderer does by default); without it Shift+Enter arrives as plain Enter.
- Esc calls `abort` and does nothing else. Pi's docs say queued steering and follow-up messages survive an abort, and its own TUI sends `clear_queue` first and puts the text back into the editor. This Module does not, so a queued message still runs after Esc. Left for later.
- Esc aborts only while `working`; with a Modal open or autocomplete showing (tickets 10, 12, 15) those must take Esc first.
- `working` is also cleared when the Backend exits, so a crash mid-run does not leave the indicator on.
- Known gaps, left for later: Shift+Enter inserts a newline only in terminals with the kitty keyboard protocol (elsewhere it arrives as Enter and sends, and Alt+Enter is taken by follow-up); the input Panel shows two text lines, and a longer prompt scrolls inside it; a prompt Pi rejects (`success: false`) is cleared from the input and nothing says so; editing a recalled history entry and then walking away discards the edit.
