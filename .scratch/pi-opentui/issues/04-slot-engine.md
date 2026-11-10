# 04: Full Slot engine

**What to build:** The Layout supports every Slot feature from the spec. Containers nest to any depth. A Panel lays out its Modules in a row or a column. Sizes can be fixed cells, a percentage or "rest", with an optional `minSize` and `hideBelow`. Every Panel scrolls on its own, and the mouse wheel scrolls the Panel under the pointer. The Layout recomputes on terminal resize. A Module can render nothing and take no space, or claim its Panel exclusively while visible, hiding its siblings. In the default Layout the second column hides below 120 columns, and the input area becomes a Container with the input Panel above a row Panel for small status Modules.

**Blocked by:** 01

**Status:** done

- [x] At 119 columns the second column is absent from the frame, at 120+ it is present, and resizing the test terminal switches between them
- [x] Fixed, percentage, rest and `minSize` sizes produce the expected widths/heights in a fixture Layout
- [x] Wheel over one Panel scrolls only that Panel's content in the frame, and wheel over another Panel scrolls that one, regardless of focus
- [x] A row Panel shows two fixture Modules side by side
- [x] A Module reporting invisible takes no rows. A Module claiming exclusivity hides its siblings, and they return when it stops
- [x] The Slot type makes "a Panel with children" or "a Container with Modules" impossible to express
- [x] A malformed size (`"0%"`, a percentage over 100, an unparseable string) and a Panel id used twice in the Layout each produce a startup error containing the field path

## Comments

- From 01: the default Layout's first column is `size: "rest"`, not `"66%"`, on purpose. With 66% and 33% a one-percent strip stays empty, and once column 2 hides below 120 columns a fixed 66% would leave a third of the screen blank. A frame test allows ±2 columns around 99/50 at width 150.
- From 01: sticky scrolling was left out of Panels; it belongs to 06.
- From 03: sizes such as `"0%"` and `"500%"` are accepted today, and duplicate Panel ids are not rejected (spec story 30).
- From 04: a Module reports itself with `context.reportPresence(accessor)` returning `"hidden" | "shown" | "exclusive"`; if several claim exclusivity, the first in Placement order wins. Hidden Modules stay mounted.
- From 04: "rest" is `size: 100%` with `flexShrink: 1`, not `flexGrow` from a zero basis, because Yoga clamps the basis up to `minSize` and skews the split even when the minimum doesn't bind.
- From 04: "Panel with children" is blocked by the Slot union; "Container with Modules" is blocked at startup because Placement keys must be Panel ids (no type can stop a string key). A `children` key on a Panel in `config.json` is ignored until 18 rejects unknown keys.
