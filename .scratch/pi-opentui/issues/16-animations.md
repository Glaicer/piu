# 16: Animations

**What to build:** Modules and the platform animate through `ctx.animate`, backed by OpenTUI's timeline and governed by the global `animations` switch. Animated in this version: the working indicator, Modal and Toast enter/exit, tool card and thinking expand/collapse, smooth Panel scrolling. With `animations: false` every animation jumps straight to its end state.

**Blocked by:** 07, 09, 12

**Status:** ready-for-agent

- [ ] On the controllable timeline, opening a Modal produces at least one intermediate frame before the final one
- [ ] With `animations: false` the same action reaches the final frame immediately
- [ ] Expanding a tool card and scrolling a Panel show intermediate frames when enabled
- [ ] The regular suite (run with animations off) still passes unchanged
- [ ] No Module in `builtin/` runs its own animation timers
