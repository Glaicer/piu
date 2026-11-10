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
