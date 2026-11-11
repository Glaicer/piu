# 15: Keyboard focus and keybindings

**What to build:** Everything clickable is reachable by keyboard. Tab and Shift+Tab move focus between Panels with a visible focus indication. Arrows, Enter and Esc act inside the focused Panel. Shortcuts are defined in the config's `keybindings` and can be remapped.

**Blocked by:** 03, 04

**Status:** done

- [x] Tab cycles focus across Panels in Layout order, Shift+Tab reverses, and the frame shows which Panel is focused
- [x] With the agent Panel focused, arrows scroll it and Enter expands the selected tool card
- [x] A fixture `keybindings` remap changes which key opens the model picker
- [x] An unknown action name in `keybindings` is a startup error with the field path
- [x] Hidden Panels (below `hideBelow`) are skipped by Tab
- [x] Restart on the Backend error card is reachable and pressable by keyboard
- [x] A newline key that works without the kitty keyboard protocol (default Ctrl+J, remappable) inserts a newline in the input
- [x] Esc during a run with a queued steer or follow-up aborts, clears the queue and puts the queued text back into the input, and the queued message never reaches the model

## Comments

- From 05: the Backend error card's Restart button has no keyboard path.
- From 08: Shift+Enter inserts a newline only with the kitty keyboard protocol; elsewhere it arrives as Enter and sends, and Alt+Enter is follow-up, so such terminals have no newline key. Check what those terminals actually send for Ctrl+J before relying on it.
- From 08: Esc only aborts. Pi's own TUI sends `clear_queue` first and puts the queued text back into the editor, so a queued steer or follow-up does not run after Esc. Pi's docs say queued messages survive an abort.
- From 09: clicking inside any Panel moves focus to that Panel's scrollbox and away from the prompt textarea, because OpenTUI focuses the clicked focusable on mouse-down unless the handler calls `event.preventDefault()`. Modal-opening handlers do; the rest of the app does not, so after clicking the chat, typing no longer reaches the input. This ticket owns where focus goes.
- From 12: while a dialog Modal is open, no key aborts the run: the Modal traps keys, and Esc cancels the dialog instead. A second Esc then reaches the prompt and aborts. The abort test calls `actions.abort` through a fixture Module (`test/probe.ts`) for that reason.
- From 12 review: Pi emits `queue_update` with the complete `steering` and `followUp` queues (`docs/json.md`, Queue and state events). The store ignores it today; it gives the queued text that Esc puts back into the input.
- From 14: the question card handles its keys itself (Left/Right tabs, Up/Down rows, Space toggle, Enter, Esc), hard-coded in `builtin/ask-user-question/card.tsx`, and leaves Tab/Shift+Tab alone. While the card is shown it holds focus, so Panel focus cycling has to coexist with it.

### Deviations and decisions (15)

- **Focus indication** is the Panel id as the border title (`input`) plus the accent border colour. A char frame has no colours, and a different `borderStyle` would break `panelText`. Only Panels in the main Layout take part: Panels inside a Modal register nothing.
- **Tab skips** a Panel that is hidden (`hideBelow`, on it or an ancestor), has no shown Module, or has nothing focusable. The empty default `side` Panel is therefore never a stop. A Panel's target is the first focusable inside a shown Module (the prompt's textarea, the question card), else the Panel's own scrollbox.
- **Click-to-focus (From 09):** a click focuses the clicked Panel and the indication shows it, so typing after a click on the chat goes nowhere until Tab or a click on the input brings the focus back. That is now visible rather than silent; no redirect of typing to the prompt was added.
- **Keybindings** are `action: key` in the config (`"focus.next": "tab"`, `"focus.previous": "shift+tab"`, `"input.newline": "ctrl+j"`, and `"command.<name>"` for every command: defaults `command.model` = `ctrl+l` (Pi's own model-selector key) and `command.reasoning` = `alt+t`). Keys are `[ctrl+][shift+][alt+]name`. An unknown action, or a key that does not parse, is a startup error naming `keybindings.<action>`. Default action names stay known when a replaced Layout leaves their Extension unplaced. Two actions bound to the same key are not rejected: the first in table order wins.
- **Model and reasoning buttons** have no focus of their own; their keyboard path is the command keybinding (or `/model`, `/reasoning`).
- **Global keys do not run while a Modal is open**, and Tab is left to the prompt while its autocomplete list is open (`holdFocusKeys` on the Module context), because a global listener runs before the focused element and a `preventDefault` there skips it.
- **Panel keys reach Modules** through `onKey` on the Module context, called from the focused scrollbox Panel's `onKeyDown`; keys nobody prevents fall through to the scrollbox's native scrolling.
- **Selected tool card (spec left it open):** Up/Down move a selection between the tool cards, the Thinking labels and the Restart button that are currently in view (a `›` prefix marks it); past the last one in view, or with none, the arrows scroll the Panel. Enter activates the selection. The selection is not cleared by scrolling, but Enter does nothing while the selected item is out of view.
- **Ctrl+J without the kitty protocol** arrives as a bare line feed (`linefeed`), distinct from Enter, and the textarea already turned it into a newline. The prompt now swallows it unless `input.newline` is bound to it, so a remap frees Ctrl+J. With kitty it arrives as `j` + ctrl. `startPiu` takes `kittyKeyboard: false` to test the legacy case.
- **Esc during a run** sends `clear_queue`, then `abort`; `abort()` now returns the cleared texts and the prompt puts them back in front of the current draft (joined by a blank line, as Pi's TUI does). The `queue_update` event stays unused.
- **From 12 (Modal swallows Esc):** unchanged.
- **From 14 (question card):** Tab/Shift+Tab leave the card for the next Panel; a full cycle returns to it (test in `ask-user.test.ts`). The card's own keys stay hard-coded.
- **Known gaps:** a key name is not validated (`"esc"` or `"ctrl+enter"` parse and never match; OpenTUI says `escape` and `return`). Esc aborts only while the prompt has focus. A Module's `onKey` fires only in scrollbox Panels, not in `"content"`-sized ones. The Tab stop on the `status` Panel does nothing but show focus.
