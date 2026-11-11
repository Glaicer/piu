# 16: Animations

**What to build:** Modules and the platform animate through `ctx.animate`, backed by OpenTUI's timeline and governed by the global `animations` switch. Animated in this version: the working indicator, Modal and Toast enter/exit, tool card and thinking expand/collapse, smooth Panel scrolling. With `animations: false` every animation jumps straight to its end state.

**Blocked by:** 07, 09, 12

**Status:** done

- [x] On the controllable timeline, opening a Modal produces at least one intermediate frame before the final one
- [x] With `animations: false` the same action reaches the final frame immediately
- [x] Expanding a tool card and scrolling a Panel show intermediate frames when enabled
- [x] The regular suite (run with animations off) still passes unchanged
- [x] No Module in `builtin/` runs its own animation timers

## Comments

### Deviations and decisions (16)

- **Config:** `animations` (boolean, default `true`) is new in `Config`; a non-boolean is a startup error naming `animations`. `startPiu` defaults it to `false`, which is how the regular suite stays unchanged; a test turns it on in its `config`.
- **`ctx.animate`** (`src/animate.ts`) is one platform animator per renderer, passed to Modules as `context.animate` and to the Modal, Toast and Panel code. It takes `{ from, to, duration, ease, loop, frameRate, onUpdate, onComplete }` and returns a cancel function. A Module's animations are cancelled when the Module unmounts. With `animations: false` it calls `onUpdate(to)` and `onComplete` synchronously; a `loop` animation does nothing (there is no end state), so the working indicator stays the still text "Working…".
- **Motions are slides and row reveals, not fades:** the char frame has no colour, so a fade has no observable intermediate frame. Modal: slides 4 rows down on open, back up on close (150 ms). Toast: slides in from the right edge, out again after its timeout. Tool card and thinking block: the body is revealed line by line (`ceil(progress * lines)`), counting logical lines, so a long wrapped line reveals as one row. Spinner: a braille spinner at 10 fps in front of "Working…".
- **Closing a Modal** keeps it drawn while it slides out, but `onDismiss`, focus restore, the key trap and the global-key guard act at the moment of dismissal (`modals.active()` leaves out closing entries). The backdrop still swallows mouse clicks for the ~150 ms of the exit.
- **Toast timeout** now runs on `renderer.clock` instead of `setTimeout`, so tests can drive it with a `ManualClock`.
- **Smooth scrolling is the mouse wheel only** (one row per tick, as before, eased over 120 ms; Shift+wheel and the edges stay with the scrollbox). Arrow-key scrolling and the sticky jump to new output are still instant. It sets the wheel event's `scroll.delta` to 0 to turn the scrollbox's own step into a no-op (see AGENTS.md).
- **Tests** (`test/animate.test.tsx`, `test/animation.test.ts`) run on a `ManualClock` passed through the new `clock` option of `startPiu`; each animation has an enabled test (intermediate frames) and a disabled test (final frame on the first render). Each was broken on purpose and went red. Esc works on a frozen clock (`pressEscape`), so no workaround was needed.
- **No timers in `builtin/`:** `grep -rnE "setTimeout|setInterval|createTimeline|useTimeline|requestAnimationFrame" builtin` finds nothing.
- **Not done (review):** the 150 ms and `outQuad` constants and the small `slide` wrapper repeat in the Modal, Toast and reveal code; left as is. No test yet for wheel scrolling back to the bottom with animations on, or for toggling a Modal mid-slide.
