# 13: Extension channel and basic ask_user_question

**What to build:** An Extension can carry a Pi extension, which the app passes to the Backend with `-e` whenever the Extension is enabled. It replaces an installed tool without a name conflict: it registers `ask_user` and deactivates `ask_user_question` if present (spec: Tool replacement). The Pi extension and its Modules talk over the Extension channel: an `editor` request with the reserved `opentui:<extension>/<channel>` title and a versioned JSON payload, answered with JSON or a cancellation, never shown as a normal Modal. The built-in ask-user-question Extension uses it. When the model calls `ask_user`, a question card replaces the input, I pick an option or dismiss, the model gets the answer or a "declined" result, and the input returns. This ticket covers the basic case: one single-select question.

**Blocked by:** 03, 04, 08, 12

**Status:** ready-for-agent

- [ ] With a test-installed Pi extension registering `ask_user_question`, the Backend starts, `ask_user` is active and `ask_user_question` is not (seen in what the faux model is offered), and calling `ask_user` shows the card
- [ ] `bun scripts/pi-bolt-compat/run.ts` gets a check that `pi-bolt` starts with our Pi extension and offers `ask_user` but not the compiled-in `ask_user_question`. Run it on this machine and record the result in ADR-0001
- [ ] The card shows the question and options in place of the input, and the input is hidden while it's shown
- [ ] Clicking an option sends it, the faux model's next turn receives that answer in the tool result, and the input is back
- [ ] Dismissing sends a declined result
- [ ] Removing the Extension's Module from Placement stops passing its Pi extension to the Backend
- [ ] A reserved-title `editor` request never shows the generic editor Modal

## Comments

- From 02: on Pi-Bolt 1.1.6 an `-e` tool with the same name as a package's `ask_user_question` does not win. Pi-Bolt fails to start (exit 1, conflict message on stderr). The "call reaches ours" criterion holds only on stock Pi, or on Pi-Bolt once the user removes the package or adds `-ne` to `backend.args`. Decide before building: ship the workaround in the README, or give our tool another name. See ADR-0001.
- Decision (after 02): own tool name `ask_user`, plus `pi.setActiveTools()` without `ask_user_question`. No `-ne`, no `pi-bolt remove`. Spec and ADR-0001 updated.
- From 04 (sizes updated by 08): the default `input-area` Container is a fixed 8 rows (input Panel 5 + status Panel 3). A question card that claims the input Panel exclusively won't fit in 5 rows, so this ticket must resize it or add a content-fit size.
- From 12: the dialog bridge is `bridgeDialogs` in `src/dialogs.tsx`, which opens a Modal for every entry of `pi.state.dialogs`. A reserved-title `editor` request has to be routed away there (and kept out of `dialogs`, or hidden in the bridge) before it reaches `dialogModal`. Auto-closing on tool end, run end and abort already applies to every entry in `dialogs`, so a channel request is covered once it is stored the same way.
