# 04: Full Slot engine

**What to build:** The Layout supports every Slot feature from the spec. Containers nest to any depth. A Panel lays out its Modules in a row or a column. Sizes can be fixed cells, a percentage or "rest", with an optional `minSize` and `hideBelow`. Every Panel scrolls on its own, and the mouse wheel scrolls the Panel under the pointer. The Layout recomputes on terminal resize. A Module can render nothing and take no space, or claim its Panel exclusively while visible, hiding its siblings. In the default Layout the second column hides below 120 columns, and the input area becomes a Container with the input Panel above a row Panel for small status Modules.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] At 119 columns the second column is absent from the frame, at 120+ it is present, and resizing the test terminal switches between them
- [ ] Fixed, percentage, rest and `minSize` sizes produce the expected widths/heights in a fixture Layout
- [ ] Wheel over one Panel scrolls only that Panel's content in the frame, and wheel over another Panel scrolls that one, regardless of focus
- [ ] A row Panel shows two fixture Modules side by side
- [ ] A Module reporting invisible takes no rows. A Module claiming exclusivity hides its siblings, and they return when it stops
- [ ] The Slot type makes "a Panel with children" or "a Container with Modules" impossible to express
