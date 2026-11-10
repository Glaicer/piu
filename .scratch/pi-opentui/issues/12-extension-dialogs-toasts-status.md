# 12: Pi extension dialogs, Toasts and statuses

**What to build:** Pi extensions' UI requests work in `piu`. `select`, `confirm`, `input` and `editor` open as Modals and answer back. `notify` shows a Toast that disappears on its own. `setStatus` values appear in a built-in status Module under the input. `setTitle` sets the terminal title, and `set_editor_text` sets the input text. A dialog still open when its tool call ends, the run ends, or I abort closes by itself. `setWidget` is accepted and ignored.

**Blocked by:** 04, 09

**Status:** ready-for-agent

- [ ] A test Pi extension's `select`, `confirm`, `input` and `editor` each show a Modal, and the chosen value reaches the extension (visible in the tool result the model gets)
- [ ] Cancelling a dialog gives the extension its cancelled value
- [ ] `notify` shows a Toast that is gone after its timeout
- [ ] `setStatus` text appears under the input and disappears when cleared
- [ ] A dialog raised by a tool that is then aborted disappears from the frame
