# 07: Выполнять команды без аргументов сразу при выборе из slash-подсказок

**What to build:** Выбор команды в окне `/`-автодополнения выполняет её сразу, если она не принимает аргументов, и только подставляет имя в input, если аргументы возможны. Локальные команды без аргументов (`/model`, `/reasoning`, `/new`, `/resume`, `/tree`, `/restart`, `/q`, `/quit`, `/exit`) срабатывают тем же путём, что и введённая целиком команда с Enter; `/compact`, который принимает необязательные инструкции, и все Backend-команды (prompt templates, skills, Pi extension commands вроде `/btw`) по-прежнему вставляются как `/name `.

**Blocked by:** None (can start immediately).

**Status:** done

## Критерии приёмки

- [x] Enter или Tab на выделенной в списке локальной команде без аргументов выполняет её немедленно: `/mod` + Enter открывает тот же model picker, что и введённый целиком `/model` + Enter; `/reas` + Tab открывает reasoning picker. После выполнения в input не остаётся `/model ` или набранного префикса, команда не уходит в Backend и не появляется в разговоре.
- [x] Все встроенные локальные команды без аргументов ведут себя так же: `/new` очищает разговор, `/resume` и `/tree` открывают свои Modal, `/restart` перезапускает, `/q`, `/quit`, `/exit` завершают piu. Поведение и побочные эффекты совпадают с выполнением команды, введённой целиком.
- [x] `/compact` вставляется в input как `/compact `, потому что принимает необязательные инструкции; выполнение начинается только после отдельного Enter. Команда, объявленная принимающей аргументы, не выполняется при выборе.
- [x] Backend-команды из `get_commands` — prompt template, skill (`/skill:<name>`) и Pi extension command (например `/btw`) — вставляются в input как `/name ` и не выполняются при выборе. Аргумент этих команд остаётся промптом, который пользователь дописывает.
- [x] Полностью введённая команда без аргументов + Enter по-прежнему выполняется ровно один раз; выбор из списка не вызывает повторного выполнения. `/MODEL` + Enter продолжает работать без учёта регистра. Esc, стрелки, фильтрация и состав списка не меняются.
- [x] Нет способа узнать аргументы Backend-команды в RPC: `get_commands` возвращает только name, description, source и sourceInfo. Поэтому все Backend-команды считаются принимающими аргументы; никакой список их имён в input не заводится. Для локальных команд признак «принимает аргументы» задаётся в описании команды, а не в UI.
- [x] Если в input кроме набираемой команды есть другой текст, команда без аргументов не выполняется, а вставляется как раньше: набранный текст не теряется.
- [x] Выбор мышью в списке не входит в тикет; клавиатурный путь остаётся единственным, как и сейчас.

### Проверки

- [x] Новые проверки через `startPiu` покрывают немедленное выполнение с Enter и Tab минимум для `/model` и `/reasoning`, очистку input, отсутствие сообщения в Backend, выполнение `/new`, а также вставку `/compact`, prompt template и extension command.
- [x] Существующие проверки обновлены под новое поведение: `Down moves the selection before Enter inserts` выбирает `/resume`, а `Tab inserts the chosen entry` — `/reasoning`; обе сейчас ожидают вставку и должны либо проверять выполнение, либо выбирать команду, которая вставляется.
- [x] Существующие проверки ввода полного `/model`, `/MODEL`, prompt template и app command, скрывающей Backend-команду, продолжают проходить. Тесты не используют личные Pi settings, credentials или extensions.

## Ticket plan

Base: `24f3a1e` on `main`, planned 2026-11-12.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 24f3a1e HEAD -- src/module.ts builtin/input/autocomplete.ts builtin/input/index.tsx builtin/model/index.tsx builtin/reasoning/index.tsx builtin/chat/session-commands.tsx src/lifecycle-commands.ts docs/extensions.md test/autocomplete.test.ts test/session.test.ts test/lifecycle-commands.test.ts`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

`Command` gets an optional `takesArguments?: boolean`, and a missing value means `true`. Every built-in except `/compact` sets it to `false`. `Entry` gets an optional `submit?: string` (`"/model"`), which is set only for local commands with `takesArguments === false`; Backend commands never carry the flag, so they keep inserting. The body of the Enter branch in `onKeyDown` moves into `submit(followUp)`, and `accept(entry)` calls it. That makes the shared path of Enter, Tab and ticket 08's click the place where execution happens. When an entry has `submit` and the input holds nothing besides the word being completed, `accept` sets the field to `entry.submit` and calls `submit(false)`. A selected command therefore runs exactly the way a typed one does: case-insensitive lookup, cleared input, an entry in history, no Backend message. Otherwise `accept` inserts `/name ` as it does today.
Rejected: an `Entry.run()` callback that calls `BoundCommand.run("")` and clears the field. It would be a second execution path beside the typed one, and it would already differ from it on history.

Decided with the user:

- `/update` also gets `takesArguments: false`, although the ticket's list leaves it out; it takes no arguments.
- A command run from the list records `/model` (the full name, not the typed `/mod`) in input history, the same as typing it, because it goes through `submit()` → `take()`.
- Ticket 08 lands before this one (see `From 08:` under Comments). This plan is pinned to `24f3a1e`, so once 08 is committed the stale check prints `builtin/input/index.tsx` and `test/autocomplete.test.ts`. Stop then, and re-run `/plan-ticket` on this ticket to re-pin the base. Step 10 (click) needs 08's `onMouseDown` row handler, which calls `accept(entry)`.

### Reuse

- The Enter branch of `onKeyDown` in `builtin/input/index.tsx` (lines 203–223): move it verbatim into `submit`, with `event.meta` replaced by `followUp`. Never copy it.
- `accept(entry)` / the `typed` and `tail` computation inside it: the "nothing else in the input" check reuses that `tail`.
- `show(text)` in `builtin/input/index.tsx`: sets the field and moves the cursor to the end before `submit`.
- `test/autocomplete.test.ts` "an app command runs locally and never reaches the model": copy its picker wait (`faux-2`), Esc, `!faux-2`, and its `Seen {messages} {lastUser}` / `'Seen 1 "hi"'` proof that nothing reached the Backend.
- `test/autocomplete.test.ts` "@ completes in the middle of text after wide characters": copy the `pressArrow("left")` loop for the "other text" test.
- `test/session.test.ts`: `send`, `agentPanel`, `treeRows`, and the `/new` and `/tree` tests' setups.
- `test/lifecycle-commands.test.ts`: `piu.exits`, `eventually` from `test/process.ts`.
- Focus check from ticket 08's plan / `test/ask-user.test.ts:132`: `/┌─ input /.test(frame)`.

### Changes

- `src/module.ts` (edit): add `takesArguments` to `Command`. `BoundCommand` spreads it unchanged (`src/app.tsx:263`), so `app.tsx` stays as it is.
- `builtin/input/autocomplete.ts` (edit): add `submit` to `Entry`.
- `builtin/input/index.tsx` (edit): type the `commands` union in `entries()` so the flag can be read, set `submit` on slash entries, extract `submit(followUp)`, add the run branch to `accept`. `routeList` and its exact-label Enter guard stay unchanged.
- `builtin/model/index.tsx`, `builtin/reasoning/index.tsx` (edit): `takesArguments: false` on `/model` and `/reasoning`.
- `builtin/chat/session-commands.tsx` (edit): `takesArguments: false` on `new`, `resume`, `tree`; `compact` stays without the field.
- `src/lifecycle-commands.ts` (edit): `takesArguments: false` on `update`, `restart`, and inside `quit()`.
- `docs/extensions.md` (edit): line 24 lists `takesArguments` among the command fields. Without it (or with `true`) choosing the command in the list inserts `/name `; with `false` choosing it runs it at once.
- `test/autocomplete.test.ts`, `test/session.test.ts`, `test/lifecycle-commands.test.ts` (edit): the tests under Steps.

```ts
// src/module.ts
export type Command = {
	readonly name: string;
	readonly description?: string;
	readonly takesArguments?: boolean;
	run(context: CommandContext, args: string): void;
};

// builtin/input/autocomplete.ts
export type Entry = {
	readonly label: string;
	readonly detail?: string;
	readonly insert: string;
	readonly submit?: string;
};
```

A missing `takesArguments` means `true`. `submit` is the text submitted when the entry is chosen with nothing else in the input. Neither type gets a code comment.

```tsx
// builtin/input/index.tsx, inside Prompt
// entries(): the union BoundCommand | BackendCommand has no common `takesArguments`, so annotate it:
const commands: readonly Pick<
	Command,
	"name" | "description" | "takesArguments"
>[] = [
	/* unchanged spread */
];
// each slash entry:
//   { label: `/${name}`, detail, insert: `/${name} `,
//     submit: command.takesArguments === false ? `/${name}` : undefined }

function submit(followUp: boolean): void;
// the former Enter-branch body: take(), match /^\/(\S+)(?:\s+([\s\S]*))?$/, run a local command
// case-insensitively, else followUp / steer / prompt and restore on refusal.
// onKeyDown: if (event.name === "return" && !event.shift) { event.preventDefault(); submit(event.meta); }

function accept(entry: Entry): void;
// after computing `typed` and `tail` as today:
// if (entry.submit !== undefined &&
//     field.plainText.slice(before().length + tail.length).trim() === "") {
//   show(entry.submit); submit(false); return;
// }
// otherwise the existing delete-and-insert.
```

### Steps

Seam: `startPiu` (`test/harness.ts`), typing with `mockInput` and asserting on the frame. Model test: `test/autocomplete.test.ts` "an app command runs locally and never reaches the model".

1. Test "choosing /model from the list with Enter or Tab runs it": a `for` table over `[["Enter", "/mod"], ["Tab", "/mod"]]`, with the key pressed via `pressEnter` / `pressTab`. `startPiu({ script: { replies: ["Seen {messages} {lastUser}"] } })`, wait `faux-1`, type the query, wait for `Switch the model`, press the key, wait `faux-2`, Esc, then wait in one predicate for `!f.includes("faux-2") && !inputArea(f).includes("/mod")`. Press Up and wait for an `inputArea` line that starts with `/model` (history recorded the full name, as `submit()` does), then clear it with `pressKey("\x15")`. Type `hi`, Enter, wait `'Seen 1 "hi"'`. Red (Enter/Tab insert `/model `), then green with the `Command`, `Entry`, `submit`, `accept` and `entries()` changes plus `/model`'s flag. Check: `bun test test/autocomplete.test.ts -t "choosing /model" 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200`.
2. Test "choosing /reasoning from the list with Enter or Tab runs it": the same table for `/reas`, waiting for `Set the reasoning level` before the key. After the key, wait for a line matching `/│ off +│/` (the picker's Modal row; the status line already shows `Reasoning: off`, so never wait on `off` alone). Esc, then in one predicate the Modal row is gone and `!inputArea(f).includes("/reas")`; then the same `hi` check. Red, then green with `/reasoning`'s flag in `builtin/reasoning/index.tsx`. Check: `-t "choosing /reasoning"`.
3. Test "a command without arguments is inserted, not run, when the input holds other text": wait `faux-1`, type `/mod later`, `pressArrow("left")` 6 times, wait for `Switch the model`, Enter. Wait for an `inputArea` line that starts with `/model` and includes `later`; that frame doesn't contain `faux-2`. Red if step 1 was implemented without the "nothing else" check (the picker opens and `later` is lost); add the check to `accept`. If step 1 already had the check, replace the condition with `entry.submit !== undefined` alone and watch it go red. Check: `-t "holds other text"`.
4. Rewrite "Down moves the selection before Enter inserts" as "Down moves the selection before Enter runs the chosen command": same keys (`/`, wait `Set the reasoning level`, Down, Enter), then wait for `No saved sessions` with `!inputArea(f).includes("/resume")` in the same predicate. Red (inserts `/resume `), then green with `resume`'s flag in `builtin/chat/session-commands.tsx`. Check: `-t "Down moves the selection"`.
5. Test in `test/session.test.ts` "/new chosen from the list clears the conversation": copy the `/new` test's setup, but replace `send(piu, "/new")` with typing `/ne`, waiting for `Start a new session`, and Enter. Then the same cleared check and `Seen 1 "again"`. Red, then green with `new`'s flag. Check: `bun test test/session.test.ts -t "chosen from the list clears" 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200`.
6. Test in `test/session.test.ts` "/tree chosen from the list opens the tree": `startPiu({ script: { replies: ["Trunk reply"] }, persistSession: true })`, `send(piu, "Trunk prompt")`, wait `Trunk reply`, type `/tre`, wait `Fork from an earlier prompt`, Tab, then wait `treeRows(f).length === 1`. Red, then green with `tree`'s flag. Check: `-t "chosen from the list opens the tree"`.
7. Tests in `test/lifecycle-commands.test.ts`: a `for` table over `[["/quit", "/qui", "Enter"], ["/exit", "/exi", "Enter"], ["/q", "/q", "Tab"], ["/restart", "/rest", "Enter"]]` named "`${alias}` chosen from the list with `${key}` runs at once". Wait `faux-1`, type the query, wait for the list row (the existing `/^[│┌] /` row predicate), press the key, `eventually(() => piu.exits.length > 0, …)`, `Bun.sleep(300)`. `exits` has length 1; `exits[0]?.restartArgs` is defined for `/restart` and undefined for the others. `/q` uses Tab because `/q` + Enter is an exact match and takes the typed path. Red, then green with the flags on `quit()` and `restart` in `src/lifecycle-commands.ts`. Check: `bun test test/lifecycle-commands.test.ts 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200`.
8. Test in `test/lifecycle-commands.test.ts` "/update chosen from the list runs at once": wait `faux-1`, type `/upd`, wait `Update the configured Backend`, Enter, then wait in one predicate for `Release checks are switched off` and `!inputArea(f).includes("/upd")` (`startPiu` switches release checks off). Red, then green with `update`'s flag. Check: `-t "/update chosen"`.
9. Insert guards in `test/autocomplete.test.ts`, already green: rename "Tab inserts the chosen entry" to "Tab inserts /compact, which takes instructions", typing `/comp`, waiting for `Compact the context`, and waiting for an `inputArea` line that starts with `/compact `. Add "an extension command is inserted, not run": `startPiu({ script })` (`extensionCommands: ["greet"]`), type `/gre`, wait `Extension command greet`, Enter, then wait for an `inputArea` line that starts with `/greet `. The existing "typing narrows the list and Enter inserts the chosen entry instead of sending" keeps covering the prompt template. Mutate `command.takesArguments === false` in `entries()` to `true` and watch all three go red, then revert. Check: `bun test test/autocomplete.test.ts 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200`.
10. Only after ticket 08 is in, re-pinned by `/plan-ticket`. Test in `test/autocomplete.test.ts` "clicking /model in the list runs it and gives the focus back to the input": wait `faux-1`, type `/mod`, wait `Switch the model`, `piu.mockMouse.click` on the `/model` row (08's `rowOf` helper), wait `faux-2`, Esc. Then in one predicate `!f.includes("faux-2")`, `/┌─ input /.test(f)` and `!inputArea(f).includes("/mod")`; type `after` and wait for `inputArea(f).includes("after")`. It's green when 08's `onMouseDown` calls `accept`. Mutate the run branch in `accept` away and watch it go red. Check: `-t "clicking /model"`.
11. Docs: edit `docs/extensions.md:24` as under Changes. Check: `biome check .` passes and the sentence names `takesArguments`.
12. Stability and suite: run each of the three test files 12 times (`for i in $(seq 12); do bun test test/autocomplete.test.ts 2>&1 | grep -a " pass\| fail"; done`, the same for `test/session.test.ts` and `test/lifecycle-commands.test.ts`), then `pnpm check` alone with the Bash tool's `timeout: 600000`.

### Commands

- Typecheck: `pnpm typecheck`
- One test file: `bun test test/autocomplete.test.ts 2>&1 | grep -a "^(fail)\| pass\| fail" | cut -c1-200` (add `-t "<regex>"` for one test)
- Full suite: `pnpm check` (about two minutes; run it alone with `timeout: 600000`)
- Lint fix: `biome check --write .`

### Pitfalls

- `routeList` already lets Enter on an exactly typed label (`/model`, `/MODEL`, `/q`) fall through to the typed path without `preventDefault`. Keep that guard: it is what sends a fully typed Backend command or `/compact` (`/review-code` + Enter). Without it they would be re-inserted with a trailing space, and "a prompt template expands and reaches the model" would fail.
- `routeList` calls `event.preventDefault()` before `accept`, which makes `onKeyDown` return early. That is what stops a selected command from running a second time in the Enter branch, so keep `accept` after `preventDefault`.
- `findTrigger` sees only the text before the cursor, so `/mod| later` and `/mod⏎more` look like a bare command to the trigger. The "nothing else" check must read `field.plainText` after `before()` plus `tail`, never `before()` alone.
- The list overlay is drawn over Panel text, and `inputArea` reads the input Panel. Assert input contents through `inputArea`, and the absence of `/mod` in the same `waitForFrame` predicate as the closed picker, or the check can pass on a frame mid-render.
- A test that already passes (step 9, step 10) proves nothing until its mutation turns it red; confirm each mutation applied with `git diff --stat` before reading a green run. Copy `builtin/input/index.tsx` to the scratchpad before mutating it.
- No fixture Extension declares a command, so `/compact` (no `takesArguments` field) is what proves the default `true`. Don't add `takesArguments: true` to it.

## Comments

- Сейчас `builtin/input/index.tsx` строит каждую slash-запись с `insert: /${command.name} `, а `accept()` только правит textarea; Enter и Tab из `routeList()` ведут туда. Сама локальная команда выполняется лишь в обработчике Enter для input, когда весь текст совпадает с `/name` (с необязательными аргументами). Поэтому выбор `/mod` вставляет `/model `, и Enter нужен второй раз.
- Реестр локальных команд: `Command` в `src/module.ts` содержит name, description и `run(context, args)`; `BoundCommand` передаёт аргументы с `""` по умолчанию (`src/app.tsx`). Встроенные команды лежат в `builtin/model/index.tsx`, `builtin/reasoning/index.tsx`, `builtin/chat/session-commands.tsx` и `src/lifecycle-commands.ts`. `/compact` уже получает текст после имени.
- Предлагаемый признак: добавить необязательный `takesArguments?: boolean` в `Command` со значением по умолчанию `true`, чтобы существующая или личная Extension-команда сохранила сегодняшнюю вставку. Встроенным командам без аргументов поставить `takesArguments: false`; `/compact` — единственная встроенная команда с аргументами. Не выводить это из имени, `run.length` или списка имён внутри input.
- Backend-команды: `RpcSlashCommand` в установленном Pi 1.5.0 (`dist/modes/rpc/rpc-types.d.ts`) не содержит метаданных об аргументах. У prompt templates есть внутренний `argumentHint` (`dist/core/prompt-templates.js`), но `get_commands` его не отдаёт (`dist/modes/rpc/rpc-mode.js`), поэтому piu не может отличить prompt template или extension command без аргументов. Считать все Backend-команды принимающими аргументы — сознательный выбор: `/btw` и `/skill:<name>` продолжают работать, а гипотетическая Backend-команда без аргументов потребует второго Enter. Вернуться к этому, если Pi добавит `argumentHint` в RPC-ответ.
- Тестовая обвязка: `test/autocomplete.test.ts` содержит проверки списка и вставки, `test/session.test.ts` перечисляет session-команды, `test/lifecycle-commands.test.ts` — lifecycle-алиасы. `startPiu` передаёт `--no-skills`, поэтому skill сейчас не покрыт; общая Backend-ветка проверяется prompt template и extension command, а для отдельной skill-проверки понадобится тестовая skill и поддержка в harness.
- Вне тикета: автодополнение аргументов после `/command `, изменение правила «локальная команда выполняется только для голого `/name`» и локальное выполнение Backend-команд. Тикет меняет только то, что происходит при выборе slash-записи; выбор мышью вынесен в тикет 08.
- From 08: ticket 08 (mouse selection) goes in before this one; a click on a list row calls the same `accept(entry)` as Enter/Tab. Put the immediate execution of no-argument commands on that shared path (inside `accept` or a function that both the click and `routeList` call), not only in `routeList`'s Enter/Tab branch, or the mouse will keep only inserting. Also add a click on `/model` to the checks: it opens the model picker, and after Esc the focus is back in the input.

### Реализация

- `Command` в `src/module.ts` получил `takesArguments?: boolean` (по умолчанию `true`). `takesArguments: false` стоит у `/model`, `/reasoning`, `/new`, `/resume`, `/tree`, `/update`, `/restart`, `/q`, `/quit`, `/exit`; `/compact` его не имеет. Сверх списка в тикете помечен и `/update` — он тоже не принимает аргументов.
- Запись slash-списка теперь несёт саму `BoundCommand` (`Entry.command` в `builtin/input/autocomplete.ts`), а `accept()` решает по ней: если команда объявила `takesArguments: false` и в input нет ничего, кроме набираемого префикса (`field.plainText === typed`), поле очищается и команда выполняется; иначе работает прежняя вставка `/name `. Backend-записи команды не несут, поэтому всегда вставляются: `get_commands` не отдаёт признак аргументов.
- Историю input после такого выполнения пополняет полное `/name`, а не набранный префикс: `take()` разделён на `remember()` и очистку, и выбор `/mod` кладёт в историю `/model` — так же, как ввод команды целиком.
- `docs/extensions.md` описывает `takesArguments` и сигнатуру `run(context, args)`.
- Проверки в `test/autocomplete.test.ts`: Enter на `/mod` открывает model picker (и после него в Backend уходит ровно один промпт), Tab на `/reas` открывает reasoning picker, `/ne` очищает разговор, Up после выбора возвращает `/model`, `/comp` и `/gre` вставляются (у `/compact` отдельный Enter доводит дело до Pi: `Nothing to compact`), слово с текстом после курсора не выполняется, а вставляется. `Down moves the selection before Enter inserts` стал `…before Enter runs it` и проверяет Toast `/resume`; `Tab inserts the chosen entry` заменён на проверку выполнения `/reasoning`.
- Вставку prompt template по-прежнему покрывает существующая `typing narrows the list and Enter inserts the chosen entry instead of sending`; новая проверка Backend-ветки сделана на extension command, потому что skill недоступен при `--no-skills`. Сценарий «в input есть другой текст» проверен на слове с хвостом после курсора: другой текст может стоять только за курсором (триггер требует, чтобы текст до курсора начинался с `/` и не содержал пробелов), а вертикальный сдвиг курсора в OpenTUI (`editorView.moveUpVisual`) не шлёт `cursor-changed`, поэтому многострочный вариант список просто не открывает. Это поведение было и до тикета и не менялось.
- Тесты: `bun test test/autocomplete.test.ts` — 19 проверок, 10 прогонов подряд зелёные; `pnpm check` — 426 pass, единственный fail (`test/polish.test.ts` «an automatic compaction leaves the chat matching Pi's messages», `No more faux responses queued`) воспроизводится и на HEAD без этих изменений.

### Ревью перед слиянием

- Ветку делали без плана: в её копии тикета раздела `## Ticket plan` нет. Вместо общего `submit()` из плана `accept()` сам вызывает `command.run()` и пишет `/name` в историю через `remember()`. Пользователь принял это решение. Следствие условия `field.plainText === typed`: если курсор стоит внутри слова (`/mod|el`), выбор вставляет `/model `, а не выполняет команду, как предлагал план.
- Из плана не сделаны шаги 6–8, то есть проверки выбора из списка для `/tree`, `/restart`, `/q`, `/quit`, `/exit` и `/update`, и мутационная проверка шага 9. Критерий 2 подтверждён чтением кода: у всех этих команд стоит `takesArguments: false`, и они идут через тот же `accept()`.
- План требует, чтобы 08 вошёл раньше 07, и при слиянии этот порядок соблюдён. `typedInInput` заменён на `inputStartsWith` из 08. Добавлен шаг 10: тест «clicking /model in the list runs it and gives the focus back to the input» без ветки выполнения в `accept()` краснеет. После 08 устарел критерий «выбор мышью не входит в тикет»: клик идёт через тот же `accept()` и тоже выполняет команду. `event.preventDefault()` в `onMouseDown` строки тестом по-прежнему не подтверждён, потому что мутация без него остаётся зелёной.
- Тест `test/polish.test.ts` «an automatic compaction leaves the chat matching Pi's messages» падает только при запуске из каталога orca-worktree. Тот же коммит ветки и база `24f3a1e` проходят в основном checkout и во временном worktree, так что дело не в ветке. Причину не искали.
