# 22: Окно субагента по центру на 75% с затемнённым Layout

**What to build:** Окно просмотра субагента, которое открывается кликом или Enter по карточке субагента, рисуется Modal'ом по центру экрана размером 75% ширины и 75% высоты терминала. Layout под ним затемняется, чтобы окно читалось как отдельный слой. Это нативная замена Pi extension `agent-view-window`, которая делала то же самое с оверлеем `AgentView` из `@chthub/pi-subagents` в Pi TUI. Под piu тот Pi extension ничего не делает: он подменяет editor component, а это no-op в RPC.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Критерии приёмки

- [ ] Окно субагента занимает 75% ширины и 75% высоты терминала (с округлением вниз, но не меньше разумного минимума) и стоит по центру. При изменении размера терминала окно пересчитывается.
- [ ] Пока окно открыто, видимая часть Layout за ним затемнена. После закрытия Layout выглядит как до открытия.
- [ ] Затемнение — опция Modal, а не код окна субагента: другие Modal без этой опции рисуются как раньше.
- [ ] Клик вне окна закрывает его, как у любого Modal; клик внутри окна не закрывает. Фокус после закрытия возвращается по обычным правилам.
- [ ] Содержимое окна (поток сообщений субагента, прокрутка) не меняется.
- [ ] Затемнение работает в светлой и тёмной теме и не ломает цвета самого окна.

### Проверки

- [ ] Проверка через `startPiu` открывает окно субагента и подтверждает его размер и положение по кадру для двух размеров терминала.
- [ ] Проверка подтверждает, что Modal без опции затемнения рисуется как раньше.
- [ ] Существующие проверки окна субагента продолжают проходить.

## Notes

- Как OpenTUI рисует полупрозрачный фон или затемнение поверх других renderable, проверить в Context7 (`/websites/opentui`) и в установленном `@opentui/core`, не по памяти.
- Исходник Pi extension для справки: `agent-view-window.ts` в agent dir (выключен в Pi settings). Код затемнения и рамки, который он импортирует (`fixed-windows/backdrop.ts`, `frame.ts`), удалён вместе с `fixed-windows` 2026-11-13 и лежит только в `backups/piu-cleanup-20261113/extensions/fixed-windows/` agent dir. Поэтому `agent-view-window.ts` в нынешнем виде включить нельзя.

## После приёмки (вручную)

- [ ] Удалить `agent-view-window.ts` из agent dir и его строку `-extensions/agent-view-window.ts` из Pi settings.

## Ticket plan

Base: `444b438` on `main`, planned 2026-11-15.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 444b438 HEAD -- builtin/chat/index.tsx test/harness.ts test/subagents.test.ts`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

The subagent view opens with percentage sizes, `moduleModal(subagentModule(id), { width: "75%", height: "75%" })`, the way `src/changelog.tsx` already opens its Modal at `"80%"`. `ModalView` (`src/modal.tsx`) centres the box inside a full-screen backdrop, so Yoga recomputes size and position on every terminal resize with no code of ours. Dimming is not touched: every Modal's backdrop already has `backgroundColor={RGBA.fromInts(0, 0, 0, 100)}` (`src/modal.tsx:130`), which dims the Layout's background and text in both Themes and leaves the Modal's own fill alone (measured at planning time).
Rejected: cell sizes from `renderer.width * 0.75` / `Math.floor`: `ModalRequest` holds plain numbers read once, so the window would not follow a resize without making `ModalRequest` reactive.

Decisions agreed with the user, to record under `## Comments` when closing:
- No dimming option on Modal: dimming already exists for every Modal (criteria 2 and 6 hold already); criterion 3 and its check are dropped because "other Modals as before" means "dimmed".
- Rounding follows Yoga (nearest cell, e.g. 121×41 gives 91×31), not "down"; the difference is at most one cell.
- No minimum size: 75% of a terminal always fits it.

### Reuse

- `src/changelog.tsx:46`: copy its `{ width: "80%", height: "80%" }` pattern.
- `onModalFill` in `test/harness.ts`: copy its span walk and `span.bg.equals(RGBA.fromHex(darkTheme.raised))` test for `modalBounds`.
- `start`, `spawn`, `send`, `spawned`, `clickCard` and `subagentsControl` in `test/subagents.test.ts`: set up and open the view exactly as the test "clicking a card opens that subagent's messages…" does.
- `piu.resize(width, height)`: from `TestRendererSetup` (`@opentui/core/testing/test-renderer.d.ts`), already spread into what `startPiu` returns.

### Changes

- `builtin/chat/index.tsx` (edit): `openSubagent` passes `{ width: "75%", height: "75%" }`; remove the now-unused `const renderer = useRenderer()` and the `useRenderer` import.
- `test/harness.ts` (edit): new exported `modalBounds`, next to `onModalFill`.
- `test/subagents.test.ts` (edit): one new test.

```ts
// test/harness.ts — bounding box of every cell whose background is darkTheme.raised; undefined when there is none
export function modalBounds(
	piu: Awaited<ReturnType<typeof startPiu>>,
): { left: number; top: number; width: number; height: number } | undefined;
```

### Steps

Seam: `startPiu` (`test/harness.ts`), measuring the Modal by its fill. Model test: `test/subagents.test.ts`.

1. Test "the subagent view fills the middle three quarters of the terminal and follows a resize": given the default 160×30 terminal and a background subagent `max` spawned with `spawn("Audit the auth code")` + `"Spawned it"` and `control.say("max", "Reading the sources")`; when its card is clicked (`clickCard`) and the frame shows "Reading the sources", then `modalBounds(piu)` is `{ left: 20, top: 4, width: 120, height: 22 }`; when `piu.resize(100, 40)` and `await piu.waitForFrame(() => modalBounds(piu)?.width === 75)`, then `modalBounds(piu)` is `{ left: 13, top: 5, width: 75, height: 30 }`. Red now (the view is 100×26), green after the `builtin/chat/index.tsx` change. Check: `bun test test/subagents.test.ts 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200`.
2. Orphan cleanup and the rest of the suite: no new test. Check: `pnpm exec tsc --noEmit` and `pnpm exec biome check builtin/chat/index.tsx test/harness.ts test/subagents.test.ts` are clean, and the step 1 command reports every test in `test/subagents.test.ts` passing (11 before this ticket, 12 after). Run that file 10 times in a row before closing.

### Commands

- Typecheck: `pnpm exec tsc --noEmit`
- One test file: `bun test test/subagents.test.ts 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200`
- Full suite: `pnpm check` (about two minutes; run it alone)

### Pitfalls

- The expected numbers are Yoga's (measured at planning time with a `75%` box centred in a full-screen box): 160×30 → 120×22 at (20,4), 100×40 → 75×30 at (13,5). Don't "fix" them toward `Math.floor`.
- `modalBounds` must be a bounding box (min/max of raised cells), not the first contiguous run: a scrollbar or other painted cell inside the Modal would otherwise cut it short. Keep the test's log short so no scrollbar shows; if the measured width is 119 with a scrollbar column in the right edge, stop and report.
- Dimmed Layout cells never equal `raised`, and `modalBounds` only works in the dark Theme (the test's default); don't add `terminalBackground`.
- Mutation check for step 1: replace `"75%"` with `100` in `openSubagent` and watch the new test go red on the width, then restore.
