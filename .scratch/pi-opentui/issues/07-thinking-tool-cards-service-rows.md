# 07: Thinking, tool cards and service rows

**What to build:** Thinking blocks appear collapsed by default with a one-line label, and a click expands them. Each tool call is a card showing the tool name, its key argument, its status (running, done, error) and its duration, and a click expands its arguments and result. Compaction and automatic retries appear as one-line service rows.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A scripted reply with thinking shows only the collapsed label, and clicking it shows the thinking text
- [ ] A scripted tool call (e.g. `read`) shows a card with name, key argument and a running status that changes to done with a duration
- [ ] Clicking the card shows the result text, and clicking again hides it
- [ ] A failing tool call shows an error status
- [ ] A triggered compaction and a scripted retry each show a service row
