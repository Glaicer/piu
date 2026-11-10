# 09: Modal platform, model and reasoning

**What to build:** Modals: any Slot can open above the Layout at a position and size (centered by default), keyboard focus is trapped inside, Esc or a click outside closes it, and Modals can stack. Under the input, built-in model and reasoning Modules show the current model and reasoning level. Clicking the model opens a picker of the Backend's available models, and clicking the reasoning level opens a picker of the levels the current model supports. Choosing one updates the Backend and the shown value.

**Blocked by:** 04

**Status:** done

- [x] Clicking the model Module opens a centered Modal listing the faux models, and picking one changes the model shown and in Backend state
- [x] The reasoning picker lists only the current model's supported levels, and picking one updates it
- [x] Esc and a click outside each close the Modal
- [x] Typing while a Modal is open doesn't change the input underneath
- [x] A Modal opened from a Modal stacks, and Esc closes only the top one

## Comments

- From 08: the input Module's Esc aborts the run whenever `working` is true. An open Modal must take Esc first, so Esc closes the Modal and does not abort.
- Modal content is a Slot plus its Placement: `ModalRequest` is `{ slot, panels, width, height, left?, top? }`, rendered by the same `SlotView` as the Layout. `moduleModal(module, size)` builds the common case, a single Panel holding one Module. `actions.openModal(request)` returns the function that closes that Modal; a picker closes itself through it. The ticket text said only "any Slot can open"; this signature is mine.
- Default Placement now puts `model.current` and `reasoning.level` in the `status` Panel. Both are new built-in Extensions (`builtin/model`, `builtin/reasoning`); their pickers share `src/picker.tsx` (mouse click, hover, Up/Down/Enter, scrolls the selected row into view).
- Esc and focus trapping live in one global key listener in `ModalLayer`. It closes the top Modal on Esc, and swallows every other key and paste unless the focused element sits inside the top Modal. Closing a Modal refocuses whatever had focus when it opened.
- Mouse handlers that open or close a Modal call `event.preventDefault()`. OpenTUI otherwise focuses the clicked Panel's scrollbox after the handler runs, which steals focus from the picker or from the input.
- The test harness now blanks every env var matching `API_KEY|_TOKEN|_SECRET` for the Backend. The author's `OPENROUTER_API_KEY` made Pi list hundreds of real models in the picker. The values are emptied (`NAME=`), not unset with `env -u`, because the wrapper-script test reads `$1` as `PI_CODING_AGENT_DIR=`.
- The faux provider's `faux-2` now has `reasoning: true`; `faux-1` has none, so the two models support different levels.
- Left out: no enter or exit animation (ticket 16), and no Modal opens for slash commands yet (tickets 10, 11).
- Known gaps, not covered by this ticket: `setModel` and `setThinkingLevel` ignore a `success: false` response, so a rejected switch closes the picker with no feedback (the Toast from ticket 12 can show it). The model and levels refresh only on attach and after the app's own switch, so a change Pi makes itself (a Pi extension, a resumed session in ticket 11) leaves the Module stale until that ticket refreshes it. Only a single-Panel Modal is tested; a Container-rooted `ModalRequest` renders through the same `SlotView` but has no test.
