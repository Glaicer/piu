# 15: Keyboard focus and keybindings

**What to build:** Everything clickable is reachable by keyboard. Tab and Shift+Tab move focus between Panels with a visible focus indication. Arrows, Enter and Esc act inside the focused Panel. Shortcuts are defined in the config's `keybindings` and can be remapped.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Tab cycles focus across Panels in Layout order, Shift+Tab reverses, and the frame shows which Panel is focused
- [ ] With the agent Panel focused, arrows scroll it and Enter expands the selected tool card
- [ ] A fixture `keybindings` remap changes which key opens the model picker
- [ ] An unknown action name in `keybindings` is a startup error with the field path
- [ ] Hidden Panels (below `hideBelow`) are skipped by Tab
- [ ] Restart on the Backend error card is reachable and pressable by keyboard
- [ ] A newline key that works without the kitty keyboard protocol (default Ctrl+J, remappable) inserts a newline in the input
- [ ] Esc during a run with a queued steer or follow-up aborts, clears the queue and puts the queued text back into the input, and the queued message never reaches the model

## Comments

- From 05: the Backend error card's Restart button has no keyboard path.
- From 08: Shift+Enter inserts a newline only with the kitty keyboard protocol; elsewhere it arrives as Enter and sends, and Alt+Enter is follow-up, so such terminals have no newline key. Check what those terminals actually send for Ctrl+J before relying on it.
- From 08: Esc only aborts. Pi's own TUI sends `clear_queue` first and puts the queued text back into the editor, so a queued steer or follow-up does not run after Esc. Pi's docs say queued messages survive an abort.
- From 09: clicking inside any Panel moves focus to that Panel's scrollbox and away from the prompt textarea, because OpenTUI focuses the clicked focusable on mouse-down unless the handler calls `event.preventDefault()`. Modal-opening handlers do; the rest of the app does not, so after clicking the chat, typing no longer reaches the input. This ticket owns where focus goes.
- From 12: while a dialog Modal is open, no key aborts the run: the Modal traps keys, and Esc cancels the dialog instead. A second Esc then reaches the prompt and aborts. The abort test calls `actions.abort` through a fixture Module (`test/probe.ts`) for that reason.
- From 12 review: Pi emits `queue_update` with the complete `steering` and `followUp` queues (`docs/json.md`, Queue and state events). The store ignores it today; it gives the queued text that Esc puts back into the input.
