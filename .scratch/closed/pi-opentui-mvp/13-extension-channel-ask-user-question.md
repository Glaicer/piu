# 13: Extension channel and basic ask_user_question

**What to build:** An Extension can carry a Pi extension, which the app passes to the Backend with `-e` whenever the Extension is enabled. It replaces an installed tool without a name conflict: it registers `ask_user` and deactivates `ask_user_question` if present (spec: Tool replacement). The Pi extension and its Modules talk over the Extension channel: an `editor` request with the reserved `opentui:<extension>/<channel>` title and a versioned JSON payload, answered with JSON or a cancellation, never shown as a normal Modal. The built-in ask-user-question Extension uses it. When the model calls `ask_user`, a question card replaces the input, I pick an option or dismiss, the model gets the answer or a "declined" result, and the input returns. This ticket covers the basic case: one single-select question.

**Blocked by:** 03, 04, 08, 12

**Status:** done

- [x] With a test-installed Pi extension registering `ask_user_question`, the Backend starts, `ask_user` is active and `ask_user_question` is not (seen in what the faux model is offered), and calling `ask_user` shows the card
- [x] `bun scripts/pi-bolt-compat/run.ts` gets a check that `pi-bolt` starts with our Pi extension and offers `ask_user` but not the compiled-in `ask_user_question`. Run it on this machine and record the result in ADR-0001
- [x] The card shows the question and options in place of the input, and the input is hidden while it's shown
- [x] Clicking an option sends it, the faux model's next turn receives that answer in the tool result, and the input is back
- [x] Dismissing sends a declined result
- [x] Removing the Extension's Module from Placement stops passing its Pi extension to the Backend
- [x] A reserved-title `editor` request never shows the generic editor Modal
- [x] A Panel can size to its content: the input Panel grows to fit the question card while it's shown and returns to the input's height after, and a content-sized Panel whose Modules are all hidden takes no rows (spec story 21)
- [x] A dialog request with a `timeout` closes its Modal once the timeout passes, since Pi has already answered it with the default value

## Comments

- From 02: on Pi-Bolt 1.1.6 an `-e` tool with the same name as a package's `ask_user_question` does not win. Pi-Bolt fails to start (exit 1, conflict message on stderr). The "call reaches ours" criterion holds only on stock Pi, or on Pi-Bolt once the user removes the package or adds `-ne` to `backend.args`. Decide before building: ship the workaround in the README, or give our tool another name. See ADR-0001.
- Decision (after 02): own tool name `ask_user`, plus `pi.setActiveTools()` without `ask_user_question`. No `-ne`, no `pi-bolt remove`. Spec and ADR-0001 updated.
- From 04 (sizes updated by 08): the default `input-area` Container is a fixed 8 rows (input Panel 5 + status Panel 3). A question card that claims the input Panel exclusively won't fit in 5 rows, so this ticket must resize it or add a content-fit size.
- From 12: the dialog bridge is `bridgeDialogs` in `src/dialogs.tsx`, which opens a Modal for every entry of `pi.state.dialogs`. A reserved-title `editor` request has to be routed away there (and kept out of `dialogs`, or hidden in the bridge) before it reaches `dialogModal`. Auto-closing on tool end, run end and abort already applies to every entry in `dialogs`, so a channel request is covered once it is stored the same way.
- From 12: story 21 is met for Modules but not for Panels: a Panel keeps its fixed rows when every Module in it is hidden. Sizes have no content-fit option yet, and this ticket needs one for the question card anyway (see From 04). Add it to the spec's common sizing.
- From 12: a dialog with a `timeout` stays on screen after Pi auto-resolves it on its side (spec story 77). The request carries the timeout in milliseconds, so the bridge in `src/dialogs.tsx` can close the Modal itself.
- Done: an Extension carries its Pi extension as `pi-extension.ts` in its folder, passed with `-e` after `--mode rpc` exactly when one of its Modules is placed. The Extension channel is `src/channel.ts`: an Extension lists its `channels`, a Module reads `context.channel.requests` and calls `answer`/`cancel`, and a channel request is a `Dialog` (method `channel`) so tool end, run end, abort and session changes close it like any other. The built-in Extension is `builtin/ask-user-question` (`ask-user-question.card`, placed before `input.prompt`). Sizes take `"content"`: the default `input` Panel and `input-area` Container use it, and the prompt's textarea is fixed at 2 rows so the input Panel stays 5. Dialogs with a `timeout` close their Modal when it passes.
- Deviation from the "Decision (after 02)" comment and the first criterion's wording: `pi.setActiveTools()` does not keep `ask_user_question` out. The installed `@juicesharp/rpiv-ask-user-question` re-adds it in its own `before_agent_start` whenever `ctx.hasUI` (true in RPC), and our `-e` handler runs first. The Pi extension instead removes it from `event.systemPromptOptions.selectedTools` in `before_agent_start`, which Pi lets win over `setActiveTools()` for the run. The user confirmed this choice after the work was committed; ADR-0001, spec and AGENTS.md record it. The test stand-in (`test/fixtures/pi-extensions/ask-user-question.ts`, installed into the temp agent dir) re-adds itself the same way, so the test fails on the `setActiveTools()` version.
- Pi-Bolt check (c) in `scripts/pi-bolt-compat/run.ts`, run on this machine with Pi-Bolt 1.1.6: PASS (`ask_user` offered, `ask_user_question` not; no conflict). Recorded in ADR-0001.
- Added beyond the ticket: a reserved-title request the app can't route (undeclared channel, payload not JSON or not `v: 1`) is cancelled at once instead of hanging the tool; a content-sized Panel is a plain bordered box and does not scroll (a scrollbox never shrinks to its content); `Picker` takes an optional `onCancel` for Esc.
- Basic case only, as the ticket says: the card shows the first question as single-select. Further questions reach the model as `(not answered)`. See ticket 14.
