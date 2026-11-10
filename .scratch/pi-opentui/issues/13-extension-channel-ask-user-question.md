# 13: Extension channel and basic ask_user_question

**What to build:** An Extension can carry a Pi extension, which the app passes to the Backend with `-e` whenever the Extension is enabled. Its tool overrides an installed Pi extension with the same tool name. The Pi extension and its Modules talk over the Extension channel: an `editor` request with the reserved `opentui:<extension>/<channel>` title and a versioned JSON payload, answered with JSON or a cancellation, never shown as a normal Modal. The built-in ask-user-question Extension uses it. When the model calls `ask_user_question`, a question card replaces the input, I pick an option or dismiss, the model gets the answer or a "declined" result, and the input returns. This ticket covers the basic case: one single-select question.

**Blocked by:** 03, 04, 08, 12

**Status:** ready-for-agent

- [ ] With a test-installed Pi extension also registering `ask_user_question`, the model's call reaches ours (the card appears)
- [ ] The card shows the question and options in place of the input, and the input is hidden while it's shown
- [ ] Clicking an option sends it, the faux model's next turn receives that answer in the tool result, and the input is back
- [ ] Dismissing sends a declined result
- [ ] Removing the Extension's Module from Placement stops passing its Pi extension to the Backend
- [ ] A reserved-title `editor` request never shows the generic editor Modal

## Comments

- From 02: on Pi-Bolt 1.1.6 an `-e` tool with the same name as a package's `ask_user_question` does not win. Pi-Bolt fails to start (exit 1, conflict message on stderr). The "call reaches ours" criterion holds only on stock Pi, or on Pi-Bolt once the user removes the package or adds `-ne` to `backend.args`. Decide before building: ship the workaround in the README, or give our tool another name. See ADR-0001.
