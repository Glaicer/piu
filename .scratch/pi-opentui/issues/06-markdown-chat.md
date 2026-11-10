# 06: Markdown in the chat

**What to build:** Assistant text in the agent Panel renders as Markdown with highlighted code blocks while it streams. Rendering is incremental: completed blocks are kept, only the trailing block(s) re-render, and highlighted code is cached. The agent Panel sticks to the bottom while I'm at the bottom and stays put when I've scrolled up.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A scripted reply with headings, lists, a table and fenced code renders formatted in the frame (no raw Markdown markers for supported elements)
- [ ] The final frame after streaming equals the frame of the same reply delivered in one chunk
- [ ] A long scripted reply (tens of thousands of characters) streams without per-delta work growing with total length, shown by a test that bounds re-rendered blocks per delta (observable via render calls exposed by the test renderer, not internal state)
- [ ] With the Panel scrolled up, new output doesn't move the visible lines. At the bottom, new output stays in view
