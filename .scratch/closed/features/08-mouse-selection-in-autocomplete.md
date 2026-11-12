# 08: Выбор мышью в окне автодополнения (`/` и `@`)

**What to build:** В окне автодополнения ввода наведение мыши на видимую строку делает её выделенной, а клик выбирает строку так же, как Enter или Tab. Для slash-команды это вставка `/name ` или немедленное выполнение локальной команды без аргументов по правилам тикета 07; для `@`-файла — вставка пути с пробелом. Фокус остаётся в input, список не прокручивается под неподвижным указателем, клавиатурное управление не меняется.

**Blocked by:** None. Клик переиспользует тот же путь выбора, что Enter/Tab, поэтому поведение из тикета 07 автоматически действует и для мыши.

**Status:** done

## Критерии приёмки

- [x] Наведение указателя на любую видимую строку списка — slash-команду или `@`-файл — делает её выделенной тем же выделением, что стрелки. Наведение на текст и на пустую часть строки работает одинаково; клик до наведения не требуется.
- [x] Клик по видимой строке выбирает и принимает её ровно один раз, как Enter/Tab на этой строке. Slash-команда вставляется как `/name ` либо выполняется, если она без аргументов; `@`-файл вставляется как путь с пробелом. Двойного срабатывания от mouse-down и mouse-up нет.
- [x] После клика по вставляющей строке фокус остаётся в input, курсор стоит после вставленного текста, и следующая набранная буква попадает в input, а не в список. Клик по строке не уводит фокус в Panel и не требует повторного клика по полю ввода.
- [x] Если выбранная мышью slash-команда открывает Modal, она открывается так же, как при Enter, а после закрытия Modal фокус возвращается в input по обычным правилам.
- [x] Когда записей больше восьми и список прокручен стрелками, наведение на видимую строку не сдвигает окно и не меняет строку под неподвижным указателем: выделяется именно та строка, на которую наведён указатель. Перемещение указателя по строкам не заставляет список прыгать.
- [x] Клавиатурное поведение не меняется: Up/Down, Enter/Tab, Esc, фильтрация, число видимых строк и порядок записей остаются прежними. Выбор мышью работает и для `@`-списка, который загружается асинхронно.
- [x] Прокрутка колесом, закрытие списка кликом вне его и drag-выделение в тикет не входят. Клик вне списка не выбирает запись.

### Проверки

- [x] Проверка через `startPiu` наводит мышь на строку prompt template или extension command и нажимает Enter: вставляется именно эта команда, хотя до наведения была выделена другая строка.
- [x] Проверка кликает по строке slash-команды и подтверждает вставку `/name `, закрытие списка, фокус в input и то, что набранный после клика текст оказывается в input.
- [x] Отдельная проверка кликает по строке `@`-файла и подтверждает вставку пути с пробелом и сохранение фокуса в input.
- [x] Проверка со списком длиннее восьми строк прокручивает его стрелками, наводит мышь на верхнюю видимую строку и убеждается, что набор видимых строк не изменился, а Enter выбирает строку под указателем.
- [x] Существующие проверки `test/autocomplete.test.ts` на клавиатурный выбор, вставку, фильтрацию и Esc продолжают проходить. Тесты не используют личные Pi settings, credentials или extensions.

## Ticket plan

Base: `24f3a1e` on `main`, planned 2026-11-12.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 24f3a1e HEAD -- builtin/input/index.tsx test/autocomplete.test.ts`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

Each list row in `Prompt` gets `onMouseMove`, which sets `selected` to `firstShown() + at()`, and `onMouseDown`, which calls `event.preventDefault()` and then the existing `accept(entry)`. A click therefore takes the same path as Enter/Tab, and the behaviour ticket 07 adds to that path reaches the mouse with no further work. `firstShown` stops being derived from `selected` and becomes a signal of its own. It shifts only when an arrow key takes the selection out of the window, it resets to 0 together with `selected` when the query changes, and hovering never touches it. That is why the window doesn't jump under a pointer that isn't moving.
Rejected: `onMouseOver`, as in `src/picker.tsx`: after every rendered frame OpenTUI synthesises an `over` event at the pointer (`recheckHoverState` in `chunk-bun-psdzwx7h.js`) but never a `move`. A pointer resting where the list opens would select its row instead of row 0, and rows that slide under a still pointer during arrow scrolling would pull the selection back to it.

Decided with the user:
- 08 goes in before 07. At this base, `accept` only inserts, so the criteria "runs when it takes no arguments" and "opens the Modal the way Enter does" are met through ticket 07's change to the shared `accept` path. Here a click is proven to give exactly what Enter gives. The note for 07 is recorded as `From 08:` in ticket 07.
- Up after scrolling now moves the selection inside the window, and the window shifts only at the top edge. Today the selection stays on the bottom row and the window shifts. Down from the top behaves exactly as before.

### Reuse

- `src/picker.tsx` rows (`onMouseDown` with `event.preventDefault()` before `pick`): copy the click handler. Take the hover handler from here too, but on `onMouseMove`, not `onMouseOver` (see Rejected).
- `accept(entry)` in `builtin/input/index.tsx`: the only acceptance path. A click calls it, never a copy of it.
- `startPiu`, `inputArea` (`test/harness.ts`), `piu.mockMouse.moveTo` / `click`, and `makeWorkspace` in `test/autocomplete.test.ts` for the `@` tests.
- Focus check copied from `test/ask-user.test.ts:132`: `/┌─ input /.test(frame)`. The Panel title shows the Panel id only while that Panel has the focus.

### Changes

- `builtin/input/index.tsx` (edit): turn `firstShown` into a signal; reset it in the existing `on(() => trigger()?.query, …)` effect; replace the Up/Down branch of `routeList` with a `move(step)` that updates both signals; add `onMouseMove`/`onMouseDown` to the row `<box>` inside `<For each={shown()}>`.
- `test/autocomplete.test.ts` (edit): add the tests under Steps, plus the local helpers `rowOf` and `shownLabels`.

```tsx
// builtin/input/index.tsx (inside Prompt)
const [firstShown, setFirstShown] = createSignal(0);   // replaces the derived `firstShown`
// query-change effect: setSelected(0); setFirstShown(0);
const shown = () => entries().slice(firstShown(), firstShown() + MAX_LIST_ROWS); // unchanged

function move(step: -1 | 1): void
// next = clamp(selected() + step, 0, entries().length - 1)
// setSelected(next)
// setFirstShown((first) => Math.min(next, Math.max(first, next - MAX_LIST_ROWS + 1)))
// routeList's up/down branch: event.preventDefault(); move(event.name === "up" ? -1 : 1);

// row <box> in <For each={shown()}>{(entry, at) => …}:
onMouseMove={() => setSelected(firstShown() + at())}
onMouseDown={(event) => { event.preventDefault(); accept(entry); }}
```

```ts
// test/autocomplete.test.ts
function rowOf(frame: string, label: string): { x: number; y: number }
// y = the frame row whose line contains ` ${label}` (the list row), x = indexOf(label) + 1
function shownLabels(frame: string, pattern: RegExp): string[]
// the labels of the visible list rows in order from top to bottom, e.g. pattern /\/zz\d\d(?= )/
const many = { replies: [], extensionCommands: Array.from({ length: 12 }, (_, i) => `zz${String(i + 1).padStart(2, "0")}`) };
```

### Steps

Seam: `startPiu` with `mockMouse.moveTo` / `mockMouse.click` and `mockInput`, asserting on the frame. Model test: `test/autocomplete.test.ts`.

1. Test "hovering a row selects it, so Enter inserts that row instead of the first": `startPiu({ script, promptTemplates })`, type `/re`, wait for a frame with `review-code` and `/reasoning`, `moveTo(rowOf(frame, "/review-code"))`, `renderOnce()`, Enter. Then a line of `inputArea` starts with `/review-code `. Red (Enter inserts the first row), then green in `builtin/input/index.tsx` (`onMouseMove`). Check: `bun test test/autocomplete.test.ts -t "hovering a row" 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200`.
2. Test "clicking a slash row inserts it, closes the list and leaves typing in the input": same start, `click(rowOf(frame, "/review-code"))`. Wait for an `inputArea` line that starts with `/review-code `. That frame doesn't contain `Set the reasoning level` and matches `/┌─ input /`; assert this before typing anything. Then type `now` and wait for an `inputArea` line whose `trimEnd()` is exactly `/review-code now`, which also proves there was no double insert from down and up. Red, then green (`onMouseDown`). Check: as step 1 with `-t "clicking a slash row"`.
3. Test "clicking an @ file row inserts the path and keeps the focus in the input": `makeWorkspace()` as `cwd`, type `see @`, wait for `src/lib/parse.ts` and `README.md` (the list loads asynchronously), `click(rowOf(frame, "@src/lib/parse.ts"))`. Wait for a line that starts with `see @src/lib/parse.ts `, check `/┌─ input /`, type `x`, and see `see @src/lib/parse.ts x`. Should be green after step 2. Mutate `accept(entry)` to `{}` in `onMouseDown` and watch it go red. Check: `-t "clicking an @ file row"`.
4. Test "hovering the top row of a scrolled list keeps the window still and Enter takes that row": `startPiu({ script: many })`, type `/zz`, wait for `Extension command zz01`, press Down 9 times, `renderOnce()`, `before = shownLabels(frame, …)` (8 labels), `moveTo(rowOf(frame, before[0]))`, `renderOnce()`. `shownLabels` of the new frame equals `before`; Enter, then an `inputArea` line starts with `${before[0]} `. Red (the window jumps back), then green (`firstShown` signal plus `move`). Check: `-t "scrolled list keeps the window"`.
5. Test "a pointer resting on the list doesn't take the selection from the keys": as step 4, but after hovering `before[0]` press Down 8 times (7 to the bottom row, 1 more to scroll), `renderOnce()`, `after = shownLabels(...)`, Enter. The inserted line starts with `${after.at(-1)} `. It's green with `onMouseMove`: switch it to `onMouseOver` for a moment and watch it go red, then switch back. Check: `-t "pointer resting"`.
6. Test "Up after scrolling moves the selection inside the window": `many`, `/zz`, Down 9 times, `renderOnce()`, `before = shownLabels(...)`, Up, `renderOnce()`. `shownLabels` is still `before`; Enter inserts `${before.at(-2)} `. It's red at the base (the window shifts up by one) and green after step 4. If steps 4–5 already made it green, mutate `move` back to `setFirstShown(Math.max(0, next - MAX_LIST_ROWS + 1))` and watch it go red. Check: `-t "Up after scrolling"`.
7. Check that no keyboard behaviour regressed: the whole file stays green, and it stays green 10–15 runs in a row (`for i in $(seq 12); do bun test test/autocomplete.test.ts 2>&1 | grep -a " pass\| fail"; done`).

### Commands

- Typecheck: `pnpm typecheck`
- One test file: `bun test test/autocomplete.test.ts 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200`
- Full suite: `pnpm check` (alone, Bash tool `timeout: 600000`); fix lint with `biome check --write .`

### Pitfalls

- `captureCharFrame` shows no colour, so the highlight itself can't be seen. Every hover test proves the selection through what Enter inserts.
- Pi's order for extension commands is not guaranteed in the tests: read the expected labels from `shownLabels` in the frame, never hard-code `zz03`.
- `mockMouse.click` sends no `move` first, so clicking doesn't depend on hovering. The tests for clicking must not `moveTo` first, or they would hide a broken `onMouseDown`.
- The list is in a `Portal` outside the app root, so `keepFocus` in `src/app.tsx` doesn't reach it. `event.preventDefault()` in `onMouseDown` follows the rule in `docs/agents/opentui.md`. The row has no focusable ancestor, so a test probably won't go red when it's removed; keep it anyway, and don't count it as proven by a test.
- The list covers the rows above the textarea, including the input Panel's top border, so `/┌─ input /` can only be seen once the list is closed. Check it after the frame that shows the insertion and before any typing, because `returnToInput` in `src/focus.ts` would otherwise carry the typed text into the input and hide a lost focus.
- A `<For>` item runs untracked. Read `firstShown()` inside the handler at the moment of the event, never captured when the row is created.
- Ticket 07 also edits `routeList`/`accept` in `builtin/input/index.tsx`. If it lands first, the stale check fires: stop and re-plan.

## Comments

- Сейчас `builtin/input/index.tsx` рисует строки списка в `<For each={shown()}>`, меняет `selected()` только по Up/Down и принимает запись только из `routeList()` по Enter/Tab. У строк нет `onMouseOver`/`onMouseDown`. Список — `Portal`, а не Modal, поэтому обработка кликов и фокуса из `ModalLayer` на него не распространяется.
- Рабочий образец уже есть в `src/picker.tsx` и `builtin/model/index.tsx`: `onMouseOver={() => setIndex(at())}` и `onMouseDown={(event) => { event.preventDefault(); pick(at()); }}`. Для автодополнения индекс строки нужно считать как `firstShown() + at()`, потому что `shown()` — это срез `entries()`.
- `accept(entry)` уже умеет и вставлять запись, и закрывать список через изменение текста. Клик должен вызывать тот же `accept`, а не отдельную копию логики: так он получит и вставку `/name `, и выполнение команд без аргументов из тикета 07.
- `firstShown()` сейчас вычисляется из `selected()`. Если наведение просто вызывает `setSelected()` на верхнюю видимую строку после прокрутки стрелками, `firstShown()` пересчитается и список прыгнет на страницу назад, а под указателем окажется другая строка. Начало окна нужно хранить отдельно и менять при движении выделения с клавиатуры или когда выделение выходит за окно; наведение на уже видимую строку не должно пересчитывать окно.
- `docs/agents/opentui.md` предупреждает: mouse-down фокусирует кликнутый элемент после обработчика. Строки списка должны вызывать `event.preventDefault()`, чтобы фокус остался в textarea; `keepFocus` на корне приложения не помогает, потому что Portal — не потомок этого корня.
- `@`-список появляется асинхронно после `listFiles()`, поэтому в тестах координаты строк доступны только после `waitForFrame`. `startPiu` предоставляет `mockMouse.moveTo` и `mockMouse.click`; существующие мышиные тесты находятся в `test/session.test.ts`, `test/focus.test.ts` и `test/ask-user.test.ts`.
- Вне тикета: прокрутка списка колесом, выбор мышью за пределами видимых восьми строк, закрытие по клику вне списка, drag и клик по строке как «открыть файл». Строка `@`-файла по-прежнему только вставляет путь.
- Реализовано в `builtin/input/index.tsx`: у строки списка `onMouseOver` ставит выделение `firstShown() + at()`, `onMouseDown` вызывает `event.preventDefault()` и `accept(entry)`. Принимает только mouse-down, поэтому двойного срабатывания от down и up нет. Клик не требует предварительного наведения: `mockMouse.click` в тестах наводит впервые уже самим нажатием.
- Начало видимого окна (`windowStart`) стало отдельным сигналом, а `firstShown()` берёт его с ограничением по длине списка. Смена запроса (фильтрация) сбрасывает и выделение, и начало окна. Наведение окно не двигает совсем; `reveal(at)` прокручивает его только когда выделение выходит за окно, поэтому стрелка вниз по-прежнему сдвигает список на строку, а Up внутри окна больше не тащит окно за собой (раньше `firstShown` считался как `selected - 7`, и Up на прокрученном списке каждый раз переставлял страницу). Тикетное «клавиатурное поведение не меняется» понято как «Up/Down, Enter/Tab, Esc, фильтрация, число видимых строк и порядок записей те же»: после того же набора клавиш выделение попадает в ту же запись, отличается только положение окна при движении вверх. Новое правило закреплено в тесте прокрученного списка нажатием Up.
- Клик идёт тем же путём, что Enter/Tab (`accept`), поэтому тикет 07 получает исполнение команд без аргументов по клику бесплатно. На этой ветке тикет 07 не реализован: ветка `Glaicer/implement-07-argumentless-commands` указывает на тот же коммит, что `main`. Поэтому клик сегодня вставляет `/name `, как Enter/Tab, а критерий про Modal выполняется ровно в той же мере, что и для Enter/Tab, и станет проверяемым только после 07 — при условии, что 07 поместит исполнение внутрь `accept`, а не в ветку Enter в `routeList`.
- Расхождение с «ровно как Enter/Tab»: Enter на полностью набранной команде строку не принимает (`routeList` пропускает `accept`, когда метка совпадает с набранным текстом) и отправляет промпт, а клик строку принимает всегда. Оставлено сознательно: указание на строку мышью однозначно означает «возьми эту строку».
- `event.preventDefault()` на строке тестом не подтверждён: у строки нет фокусируемого предка (Portal — сосед корня приложения, поэтому `keepFocus` клик по списку не видит), и мутация без `preventDefault` остаётся зелёной. Оставлено по правилу `docs/agents/opentui.md` для обработчика, который двигает фокус; проверяемым станет после 07, где `accept` открывает Modal.
- Мутации (`docs/agents/testing.md`): без `onMouseOver` краснеют оба теста на наведение; без `accept` — оба теста на клик; `firstShown` из `selected()` и `reveal`, всегда пересчитывающий окно, — тест прокрученного списка. Новые тесты прогнаны 12 раз подряд без падений, `test/autocomplete.test.ts` целиком зелёный (17 тестов).
- Проверки в `test/autocomplete.test.ts`: наведение на строку prompt template и Enter вставляет эту команду, хотя выделена была другая (с проверкой цвета выделения через `captureSpans`); клик по строке slash-команды вставляет `/review-code `, закрывает список, оставляет индикатор фокуса на `input` и принимает набранный после клика текст; `@`-строка выделяется наведением и вставляется кликом по пустой части строки (`see @src/lib/parse.ts `) с сохранением фокуса; список из 12 записей прокручен стрелками, наведение на верхнюю видимую строку и переход указателя на другую строку не меняют набор видимых строк, а Enter берёт строку под указателем. Тесты, сравнивающие цвет, передают `terminalBackground: "dark"` и не используют личные Pi settings, credentials или extensions.
- Отклонения от буквы тикета в тестах: `@`-проверка дополнительно наводит мышь на строку `@README.md` (критерий «выбор мышью работает и для `@`-списка»), а проверка длинного списка дополнительно нажимает Up после прокрутки и проверяет, что окно не двигается при переходе указателя со строки на строку.
- Вне тикета осталось: прокрутка списка колесом, закрытие списка кликом вне его, drag-выделение и клик по `@`-строке как «открыть файл». Клик вне списка запись не выбирает: обработчиков вне строк нет, а клики по другим Panel уже держат фокус в input (`test/focus.test.ts`).
- Полный `pnpm check`: 425 тестов прошли, падает известный тест автоматической компактизации в `test/polish.test.ts` (`No more faux responses queued`); он падает и на чистом `HEAD` — проверено тремя прогонами после `git checkout` изменённых файлов.
- Review (Standards): убрана дублирующая копия `setSelected` в `onMouseDown` (выделение после клика не рисуется, `accept` закрывает список) и комментарий, повторяющий правило из `docs/agents/opentui.md`. В тестах заведены `inputStartsWith`, `EMPTY_COLUMN` с пояснением, `rowOf` с внятной ошибкой вместо `expect` внутри и явный `terminalBackground: "dark"` там, где сравнивается цвет.
- Review (Spec): критерий про Modal нельзя проверить до тикета 07 (см. выше); наведение на `@`-строку и на пустую часть строки теперь проверяются тестами.
- Ревью перед слиянием: ветка выделяла строку по `onMouseOver`, который план отверг. Воспроизведено: если указатель стоит там, где откроется список, `/` + Tab брал строку под указателем (`/tree`), а не запись 0; после тикета 07 этот Tab или Enter выполнял бы команду. Теперь строка выделяется по `onMouseMove`. Тест «a pointer resting where the list opens leaves the first entry selected» красный с `onMouseOver` и зелёный с `onMouseMove`, прежние тесты наведения остаются зелёными. Остальные отличия ветки от плана оставлены: вместо отдельного `move(step)` — `reveal(at)` и `firstShown()` с ограничением по длине списка.
