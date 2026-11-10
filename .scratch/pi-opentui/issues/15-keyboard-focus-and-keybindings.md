# 15: Keyboard focus and keybindings

**What to build:** Everything clickable is reachable by keyboard. Tab and Shift+Tab move focus between Panels with a visible focus indication. Arrows, Enter and Esc act inside the focused Panel. Shortcuts are defined in the config's `keybindings` and can be remapped.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Tab cycles focus across Panels in Layout order, Shift+Tab reverses, and the frame shows which Panel is focused
- [ ] With the agent Panel focused, arrows scroll it and Enter expands the selected tool card
- [ ] A fixture `keybindings` remap changes which key opens the model picker
- [ ] Hidden Panels (below `hideBelow`) are skipped by Tab
