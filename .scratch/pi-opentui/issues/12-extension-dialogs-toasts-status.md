# 12: Pi extension dialogs, Toasts and statuses

**What to build:** Pi extensions' UI requests work in `piu`. `select`, `confirm`, `input` and `editor` open as Modals and answer back. `notify` shows a Toast that disappears on its own. `setStatus` values appear in a built-in status Module under the input. `setTitle` sets the terminal title, and `set_editor_text` sets the input text. A dialog still open when its tool call ends, the run ends, or I abort closes by itself. `setWidget` is accepted and ignored.

**Blocked by:** 04, 09

**Status:** done

- [x] A test Pi extension's `select`, `confirm`, `input` and `editor` each show a Modal, and the chosen value reaches the extension (visible in the tool result the model gets)
- [x] Cancelling a dialog gives the extension its cancelled value
- [x] `notify` shows a Toast that is gone after its timeout
- [x] `setStatus` text appears under the input and disappears when cleared
- [x] A dialog raised by a tool that is then aborted disappears from the frame

## Comments

- From 04: the default `status` row Panel exists with an empty Placement, so it shows as an empty 3-row bordered box under the input. Sizes have no content-fit option, so story 21 ("Panels shrink when a Module has nothing to show") is only met for Modules, not Panels.
- From 08: when Pi rejects a prompt (`success: false`), the input is already cleared and nothing tells the user. Show the error as a Toast and keep the text.
- From 09: `select`, `confirm`, `input` and `editor` can use `moduleModal` (`src/modal.tsx`). `Picker` covers `select`. A Modal with no focusable element still traps keys, so a dialog must focus its own input or button.
- From 11: `fork` returns the text of the prompt it forked from, and Pi's own TUI puts it in the editor. `actions.fork` drops it today; once `set_editor_text` exists, `fork` should set the input to it. Also silent today, and Toast candidates: `/resume` with no saved sessions, a failed `/compact` before it starts, and a refused `fork`.
- From 11: `reloadSession` (after New session, Resume and Fork) clears only streaming, working and service rows. Pending extension dialogs and statuses, once the store holds them, need clearing there too.
- Done: `select`, `confirm`, `input` and `editor` Modals (`src/dialogs.tsx`), `notify` Toasts (`src/toast.tsx`, 3 s, `showToast` on the Module context's actions), a built-in `status.line` Module in the default `status` Panel (hidden while empty), `setTitle` and `set_editor_text` (`editorText` in the store, applied by the prompt). `setWidget` is ignored.
- Deviation: dialogs are cancelled (`cancelled: true`) before `abort` is sent. Pi's `abort` waits for the run to go idle, so an extension that raises a dialog without a signal would otherwise hang the abort for good.
- Deviation: a dialog belongs to the tool calls running when it arrived (the request carries no tool call id) and closes when all of them have ended; one raised with no tool running closes at `agent_end`. With parallel tools a dialog can outlive its own tool until the run ends.
- Deviation from the "From 11" comment: a failed `/compact` before it starts is not silent, because Pi still emits `compaction_end` and the service row shows the reason. No Toast added. `/tree` with no prompts to fork from is still silent.
- From 08 done: Pi's `success: false` on `prompt`, `steer` and `follow_up` shows its error as a Toast and the text goes back into the input (only if the input is still empty). A dead Backend does not, because the error card already shows it.
- From 11 done: `fork` puts the forked prompt in the input; `/resume` without sessions and a refused `new_session`/`switch_session`/`fork` (`success: false`, untested: nothing here makes Pi refuse) show a Toast; New session, Resume and Fork clear pending dialogs and statuses _before_ the request, so statuses and dialogs the new session raises while starting survive.
- Not done: a dialog with a `timeout` stays on screen after Pi auto-resolves it on its side (the docs say clients need not track timeouts, but nothing closes the Modal). A cancelled `new_session` (an extension veto) has already cleared the statuses until the extensions set them again.
- Story 21 for Panels (From 04) is still unmet: the status Panel keeps its 3 rows when `status.line` is hidden. It needs a content-fit size.
- `GLOSSARY.md` lists "Dialog" under `_Avoid_` for Modal, while the code uses `Dialog` for Pi's `select`/`confirm`/`input`/`editor` requests (Pi's own word). Decide whether the glossary should name Pi's request.
