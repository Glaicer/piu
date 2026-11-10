# 08: Input

**What to build:** The prompt input is multi-line (Enter sends, Shift+Enter inserts a newline) with history on Up/Down. While the agent works, Enter steers the current run, Alt+Enter queues a follow-up and Esc aborts. A working indicator is visible while the agent runs.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Shift+Enter creates a second line, and Enter sends both lines as one prompt that the faux model receives
- [ ] After two prompts, Up recalls the second then the first, and Down goes back
- [ ] During a slow scripted reply, Enter's text reaches the model as a steering message and Alt+Enter's text arrives after the run as a follow-up
- [ ] Esc during a run stops it and the indicator disappears
- [ ] The working indicator is shown during the run and gone after `agent_settled`
