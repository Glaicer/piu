# 06: Markdown in the chat

**What to build:** Assistant text in the agent Panel renders as Markdown with highlighted code blocks while it streams. Rendering is incremental: completed blocks are kept, only the trailing block(s) re-render, and highlighted code is cached. The agent Panel sticks to the bottom while I'm at the bottom and stays put when I've scrolled up.

**Blocked by:** 01

**Status:** needs-info

- [x] A scripted reply with headings, lists, a table and fenced code renders formatted in the frame (no raw Markdown markers for supported elements)
- [x] The final frame after streaming equals the frame of the same reply delivered in one chunk
- [x] A long scripted reply (tens of thousands of characters) streams without per-delta highlighting growing with total length, shown by a test that bounds the highlighter input: no `highlightOnce` call covers more than one block, and each block is highlighted a bounded number of times
- [x] With the Panel scrolled up, new output doesn't move the visible lines. At the bottom, new output stays in view

## Comments

Implemented in `a7a1e13` and the follow-up commit. Deviations and open points:

- **Highlight cache: open, waiting on a decision.** "Highlighted code is cached" is not built. `<markdown>` types a `treeSitterClient` prop, but `MarkdownRenderable` has no setter for it and OpenTUI's Solid layer creates elements with only `{ id }`, so the prop never arrives and code blocks always use the global client. Two ways in, neither through `<markdown>` alone: build `MarkdownRenderable` imperatively (its constructor takes `treeSitterClient`) inside a Solid ref, or use `renderNode` + `defaultRender()` and set `treeSitterClient` on each code block's renderable, which creates and drops a throwaway renderable on every update. Until then, a finished block keeps its renderable and is highlighted once while it stays mounted; a remount (Restart) or the same code in another message is highlighted again. Spec line "Code-block highlighting is cached by language and text" still stands.
- **Speed criterion measures highlighter input, not render calls.** The test renderer's `getNativeStats().frameWork` was flat in both `<markdown>` modes: the native scene paints only the viewport, and the per-delta re-highlight runs in JS and the tree-sitter worker, which those stats don't see. So the test spies on `getTreeSitterClient().highlightOnce`. Switching to the default `coalesced` mode turns it red (one call of 21,598 characters against a bound of 54).
- **Remaining growth.** OpenTUI still walks every token and block on each delta (cheap compares, and native paint visits grow with block count): about 2.5 ms per delta at 56k characters, against about 0.3 ms for a short reply.
- **Uses `internalBlockMode="top-level"`,** which OpenTUI marks experimental.
- **Following output is a Module declaration** (`followsOutput` on the chat Module), not Panel config: a Panel sticks while any visible Module in it follows output, so a replaced Layout keeps it.
- **The one-chunk frame comes from the session loaded with `-c`,** which never streams. Even a render-mode switch at the end of streaming leaves the final frame equal, so this test pins OpenTUI's end state more than our code.
