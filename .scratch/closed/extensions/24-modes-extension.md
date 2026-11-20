# 24: Режимы агента как Extension

**What to build:** Extension `modes` с Pi extension внутри. Пользователь переключает режим агента (`Build` и режимы из `.md` файлов в папке `modes` agent dir и, в доверенном проекте, в `.pi/modes`) клавишей Alt+M по кругу или командой `/mode`, которая показывает выбор, и `/mode <name>`. Текущий режим всегда виден первым пунктом в строке подсказок под полем ввода: `Build · / commands   @ files`. Режим задаёт инструкции в системном промпте, набор tools, модель и уровень thinking, как сейчас делает личный Pi extension `modes`, и сохраняется в сессии.

Почти вся логика `modes` работает через RPC и так: правка системного промпта в `before_agent_start`, `setActiveTools`, `setModel`, `setThinkingLevel`, выбор через Dialog, статус. Не работает только шорткат: `registerShortcut` в RPC не доходит. Поэтому Pi extension переносится почти как есть, а piu добавляет клавишу и показ режима.

**Blocked by:** 33 (действия Extensions, несколько сочетаний и последовательности в keybindings).

**Status:** done

## Решения

- **Режим по умолчанию называется `Build`** (в нынешнем `modes` он `default`): так он называется в индикаторе, в выборе `/mode` и в `/mode build`.
- **Индикатор — первый пункт левой части строки подсказок под полем ввода** (тикет 40, `keyHints` и левая часть в `builtin/input/index.tsx`): `Build · / commands   @ files`, отделён от подсказок точкой `·` цветом `faint`. Имя режима рисуется новым токеном `agentMode`. Виден всегда, в том числе в `Build` и во время работы агента (тогда меняется только правая часть).
- **Новый токен Theme `agentMode`** — цвет имени режима: светлая `#b85400`, тёмная `#ffa04d` (те же значения, что у `warning`, но токен отдельный). Не `mode`: ключ `theme.mode` тикет 32 отдаёт под режим темы. Токен публичный: идёт в `themeTokens` (`src/theme.ts`) и заменяется в Config как `theme.agentMode`.
- **Загрузка:** строку подсказок рисует Module `input.prompt`, а Extension `modes` загружает свои `commands` и Pi extension, только если один из её Modules стоит в Placement. Как `modes` отдаёт имя режима в строку подсказок и чем держит себя загруженной (например, скрытый Module с `reportPresence("hidden")`), решить в плане. Без `input.prompt` в Placement индикатора нет.

## Критерии приёмки

- [x] Pi extension Extension'а делает то же, что нынешний `modes`: формат файлов режима (frontmatter `model`, `thinking`, `tools`; тело — инструкции), порядок `Build` + остальные по алфавиту, возврат к базовым модели, thinking и tools при выходе в `Build`, восстановление режима из сессии при старте и предупреждение, если файл режима пропал.
- [x] Alt+M переключает на следующий режим по кругу. Клавиша — keybinding в Config, её можно переназначить.
- [x] `/mode` без аргументов открывает выбор режима с отметкой текущего; `/mode <name>` переключает сразу; неизвестное имя — Toast со списком режимов.
- [x] Текущий режим виден первым пунктом строки подсказок под полем ввода (`Build · / commands   @ files`), по умолчанию `Build`, в том числе пока агент работает. Имя режима цветом токена `agentMode`, точка `faint`; замена токена в Config применяется. Индикатор рисует piu, а не ANSI-строка из `setStatus`.
- [x] После перезапуска piu (Restart) режим сессии восстанавливается.
- [x] Набор tools режима держится в течение всего хода, в том числе вместе с Pi extension `ask-user-question`, который правит `selectedTools` в `before_agent_start`.

### Проверки

- [x] Проверка через `startPiu` с временным agent dir и двумя файлами режимов: Alt+M дважды, индикатор показывает каждый режим по очереди, затем снова `Build`.
- [x] Проверка: в режиме с `tools` faux model получает только эти tools в запросе после tool result.
- [x] Проверка: `/mode <name>`, Restart, режим восстановлен.
- [x] Ручная проверка `! bun scripts/pi-bolt-compat/run.ts` на настоящем agent dir; до неё тикет отмечает это как непроверенное. В agent dir с 2026-11-13 нет пакета rpiv, поэтому проверка скрипта, рассчитанная на него, ничего о rpiv не скажет.

## Notes

- Прочитать `docs/agents/pi-extensions.md` до начала: дубли имён tools на Pi-Bolt — ошибка запуска, и `setActiveTools()` может перебить чужой `before_agent_start`.
- Alt+M — действие Extension `modes` со своим сочетанием по умолчанию (тикет 33), а не `command.<name>`: `/mode` — команда Pi extension. Как действие доходит до Pi extension и не столкнутся ли `/mode` piu и Pi в `/`, решить в плане тикета.
- Исходник для справки: `modes.ts` и `modes/plan.md` в agent dir (`modes.ts` выключен в Pi settings).

## После приёмки (вручную)

- [ ] В `modes/plan.md` agent dir заменить `ask_user_question` на `ask_user` в списке tools: пакет rpiv удалён, в piu инструмент вопросов называется `ask_user`.
- [ ] Удалить `modes.ts` из agent dir и его строку `-extensions/modes.ts` из Pi settings; папку `modes/` оставить — её читает новый Pi extension.

## Ticket plan

Base: `7cde9b6` on `main`, planned 2026-11-19.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 7cde9b6 HEAD -- builtin/modes/index.tsx builtin/modes/protocol.ts builtin/modes/pi-extension.ts builtin/input/index.tsx src/config.ts src/pi-state.ts src/theme.ts test/composer.test.ts test/design.test.ts test/fixtures/faux-backend.ts test/modes.test.ts test/lifecycle.test.ts`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

Pi owns the mode, its session entry and the one public `/mode` command. A hidden placed Module loads the Extension; its configurable action sends `/mode :next` through the existing prompt RPC and Pi publishes the plain display name on a reserved `setStatus` key. The input Module renders that name independently of the ordinary status Panel and the right-hand key hints. Refuse changes while Pi is busy rather than changing model or loadout mid-run.

Rejected: a second slash command in piu or a new RPC channel for cycling: two handlers would duplicate routing, and the existing Extension channel only initiates requests from Pi; prompt RPC already executes Pi commands without sending a message to the model.

### Reuse

- Personal `~/.pi/agent/extensions/modes.ts`: reference for file format, trust, name ordering, base settings and `mode-state` entry shape; do not import or edit it.
- `builtin/btw/index.tsx`: hidden Module; `src/pi-state.ts` reserved `setStatus` branches: consume structured Extension state before generic statuses.
- `src/extensions.ts` `resolvePlacement` and `collectKeybindingActions`: load the Extension from Placement and expose `modes.next` in existing Hotkeys machinery.
- `test/composer.test.ts` `fgAt` and `idleHints`: native hint row and foreground checks; `test/lifecycle.test.ts` `/restart` test: fresh Backend PID and output since a process mark.
- `test/fixtures/pi-extensions/ask-user-question.ts`: installed legacy tool stand-in; pass its existing path to `installedPiExtensions`, not a second copy of the built-in Extension.

### Changes

- `builtin/modes/protocol.ts` (new): shared literals below; no runtime dependencies.
- `builtin/modes/index.tsx` (new): default `Extension` with Module `bridge`, `render(context)` reports `"hidden"` and returns `null`; `keybindingActions` entry `next`, description `Next agent mode`, `defaultBindings: ["alt+m"]`, `run(context)` calls `void context.actions.prompt(MODE_NEXT_PROMPT)`. No piu `commands`.
- `src/config.ts` (edit): append `"modes.bridge"` to default `placement.status`, after `"status.line"`; normal Placement overrides still apply.
- `src/pi-state.ts` (edit): add `agentMode` to `PiState` and its store (`BUILD_MODE` initially); reserved `setStatus` branch stores `record.statusText || BUILD_MODE`, then breaks before generic statuses. Reset to `BUILD_MODE` in `clearExtensionUi` and on non-running Backend health.
- `src/theme.ts` (edit): add `"agentMode"` to `themeTokens` and both palettes (`#ffa04d` dark, `#b85400` light); existing Config validation and overrides apply.
- `builtin/input/index.tsx` (edit): `Prompt` puts a single-line truncated mode text first on the hint row, colored `theme.agentMode`. The existing idle command-hint branch renders `{" · / commands   @ files"}` in `faint`; if images, draft, or exit confirmation hide that branch, show the mode without a separator. Separate the image count from the mode with a space. Right-hand hints yield space first; keep their text and behavior.
- `builtin/modes/pi-extension.ts` (new): default Pi factory below. Port discovery, switching and session restore under these rules:
  - Read `getAgentDir()/modes`, then `ctx.cwd/.pi/modes` only when `ctx.isProjectTrusted()`. Read only `.md`, derive the display name from the basename, use lowercase lookup keys, let project matches win, sort remaining modes by display name with `localeCompare`. Reserve `build` and `:next` after lowercasing; skip invalid names (blank or containing control characters) and invalid frontmatter with a warning. Missing directories are normal. Use Pi's `parseFrontmatter`; `model` is `provider/id` with both parts nonempty, `thinking` is one of `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `tools` is a string array (including `[]`); omitted fields inherit base. Keep body as instructions.
  - Register `mode` once. Trim arguments: blank opens `ctx.ui.select("Agent mode", labels)` with ` (current)` on the current mode; cancel is a no-op. `:next` cycles through `Build` then sorted display names and back, starting at `Build` if the active file vanished. Explicit names are case-insensitive; unknown names notify with level `"error"` and list `Build` plus discovered names. Refuse while `!ctx.isIdle()` with a warning, including after a pending selection resolves; use a handler-local-to-factory busy flag with `finally` to prevent overlapping mode changes or stale selection.
  - On leaving `Build`, capture current `provider/id`, thinking and active tools once. Carry that same base across non-Build switches. Apply model before thinking, resolving through `ctx.modelRegistry.find` and `await pi.setModel`; warn on missing/unavailable model, do not substitute an unrelated model. Restore base model/thinking/tools on `Build`. Re-selecting the current name is a no-op.
  - Resolve the active whitelist once on apply (warn on unknown tool names, drop them and dedupe); preserve the distinction between omitted and empty. Set the candidate loadout at the transition to base tools plus resolved whitelist tools, or just base tools when there is no whitelist. In `before_agent_start`, set/delete `event.systemPromptOptions.sections.mode`; for an explicit whitelist intersect the current `selectedTools` with it in place. Do not re-add names removed by earlier hooks or call `setActiveTools` in this hook; the later `ask-user-question` hook may also remove a name. Pi applies this resulting loadout to the run, including after tool results.
  - Append the existing `mode-state` custom-entry shape on successful changes (`{}` for `Build`). On `session_start` read the latest such entry on `ctx.sessionManager.getBranch()`, not the latest nonempty one; validate persisted data before use. Load and reapply the saved mode from its file, including model/thinking and candidate tools, without writing a duplicate mode entry. If it vanished, warn, apply its saved base and append `{}`. Always publish the resulting display name (including `Build`) via `ctx.ui.setStatus(MODE_STATUS_KEY, name)` without ANSI.
- `test/composer.test.ts` and `test/design.test.ts` (edit): replace existing idle prefix expectations with `Build · / commands   @ files`; in composer align `Build` (not `/ commands`) to the field and check colors separately. Keep existing assertions that command/file hints disappear on draft, that right hints truncate first, and that working keys are on the right.
- `test/fixtures/faux-backend.ts` (edit): add `{modeInstructions}` to the existing `substitute` function, using `getCurrentSystemMessage(context.messages)?.sections.mode ?? ""` so it tests the effective provider transcript.
- `test/modes.test.ts` (new): tests through `startPiu`. Use `dir` made with `mkdtempSync` and prewrite `<dir>/agent/modes/*.md` (the harness creates but does not clear that agent dir); use `inputHints`, `modalText`, and `working`; wait for `faux-1` before sending commands.
- `test/lifecycle.test.ts` (edit): add real Restart cases through `prepareFixture` and `spawnPiu`, writing mode files before the process starts and using `persistSession: true`.

```ts
// builtin/modes/protocol.ts
export const BUILD_MODE = "Build";
export const MODE_STATUS_KEY = "opentui:modes/current";
export const MODE_NEXT_PROMPT = "/mode :next";

// src/pi-state.ts — added PiState property
readonly agentMode: string;

// builtin/modes/pi-extension.ts — types and function signatures
type Thinking = ReturnType<ExtensionAPI["getThinkingLevel"]>;
type Mode = { name: string; model?: string; thinking?: Thinking; tools?: string[]; instructions: string };
type Base = { model?: string; thinking: Thinking; tools: string[] };
type State = { active?: { name: string; base: Base } };
type Active = { mode: Mode; base: Base; allowedTools?: readonly string[] };
function parseMode(path: string): Mode;
function loadModes(ctx: ExtensionContext): Map<string, Mode>;
function parseState(data: unknown): State;
export default function modes(pi: ExtensionAPI): void;
// Inside modes:
async function apply(mode: Mode | undefined, base: Base, ctx: ExtensionContext): Promise<void>;
```

### Steps

Seam: `startPiu` for the prompt, Config, Alt+M, slash list, Dialog, Toast and faux provider output; `spawnPiu` for a real launcher Restart. Model test: `test/composer.test.ts` (19 tests passed on the base).

1. Test "Build leads the idle hints": extend the existing idle composer test for position, default `agentMode`, faint separator and unchanged right hints; update the existing prefix expectations. Red, then green in `test/composer.test.ts` and `test/design.test.ts`. Check: `bun test test/composer.test.ts test/design.test.ts`.
2. Test "mode hint uses its Config color even with a draft": set `theme.agentMode` to `#123456`, type `x`; check native foreground and `Build` without command hints. Red, then green in `test/modes.test.ts`. Check: `bun test test/modes.test.ts`.
3. Test "the current mode remains visible while working": extend the composer working test to wait for the working hint and assert the left prefix on that same frame. If already green, remove the mode indicator only during work and verify red before restoring. Check: `bun test test/composer.test.ts`.
4. Test "direct mode applies overrides and Build restores base": use an `Alpha.md` with `faux/faux-2`, `high`, `[read]` and a distinctive instruction. First sample the base with a faux reply exposing `{model}`, `{reasoning}`, `{tools}`, `{modeInstructions}`; run `/mode alpha`, verify the displayed mode and next request; run `/mode build`, verify a third request with original values and no mode instruction. Red, then green in `test/modes.test.ts`. Check: `bun test test/modes.test.ts`.
5. Test "slash picker marks current and selects a mode": open `/mode` in Build; verify `Build (current)` and ordered choices, choose `Alpha` via the Dialog, then wait for the changed hint. Red, then green in `test/modes.test.ts`. Check: `bun test test/modes.test.ts`.
6. Test "unknown mode lists available names": submit `/mode missing`; verify Toast includes `missing`, `Build`, and the sorted mode names and mode remains unchanged. Red, then green in `test/modes.test.ts`. Check: `bun test test/modes.test.ts`.
7. Test "slash completion offers one mode command": type `/mode` without Enter and count autocomplete rows whose command name is exactly `/mode`; assert one. If already green, verify red by duplicating the entry in the test mutation. Check: `bun test test/modes.test.ts`.
8. Test "Alt+M cycles and wraps without submitting a turn": create `Zulu.md` before `Alpha.md`, press `mockInput.pressKey("m", { meta: true })` three times, waiting after each for `Alpha`, `Zulu`, `Build`; assert no `/mode :next` user message or faux reply. Red, then green in `test/modes.test.ts`. Check: `bun test test/modes.test.ts`.
9. Test "mode cycle can be rebound": configure `keybindings: { "modes.next": "alt+y" }`; Alt+M must leave Build unchanged, Alt+Y selects Alpha (if both ran, it would wrap). Red, then green in `test/modes.test.ts`. Check: `bun test test/modes.test.ts`.
10. Test "mode change is refused during a turn": hold a bash tool with the release-file pattern from `test/pending.test.ts`, invoke Alt+M, wait for the refusal Toast and assert the working frame still shows the same mode; release the tool. Red, then green in `test/modes.test.ts`. Check: `bun test test/modes.test.ts`.
11. Test "mode tool allowlist holds before and after a tool result": load the installed-question stand-in alongside default Placement; whitelist `[read, ask_user, ask_user_question]`. First faux step prints `first {tools}` and calls `read` on an existing fixture file; second prints `after {tools}` with the result. Both must report exactly `ask_user,read`, not the legacy tool or any unlisted built-in. Red, then green in `test/modes.test.ts`; mutate out the mode intersection and the built-in removal separately to check both mechanisms (restore those mutations). Check: `bun test test/modes.test.ts`.
12. Test "Restart restores the session mode": select Alpha, send a prompt to establish a persisted session, mark the terminal, invoke `/restart`, wait for a different Backend PID and restored Alpha at the start of the hint row after the mark; send a distinct prompt and verify the restored mode instructions/tools. Red, then green in `test/lifecycle.test.ts`. Check: `bun test test/lifecycle.test.ts`.
13. Test "Restart warns and returns to Build when the mode file vanished": same start, delete the fixture mode file before Restart, then require the post-mark warning, Build hint and restored base in a new request. Red, then green in `test/lifecycle.test.ts`. Check: `bun test test/lifecycle.test.ts`.
14. Test "project modes require trust": write the same basename with distinct instructions in both roots; run through `startPiu` with `extraBackendArgs: ["--no-approve"]` and `["--approve"]` in separate fixtures, selecting that name and observing global vs project instructions respectively. Red, then green in `test/modes.test.ts`. Check: `bun test test/modes.test.ts`.
15. Manual compatibility check: once the Pi extension first works, ask the user to run `! bun scripts/pi-bolt-compat/run.ts` with the real agent dir. Until they report a result, mark this check unverified; the current agent dir cannot verify rpiv compatibility.

### Commands

- Typecheck: `pnpm typecheck`
- One test file: `bun test test/modes.test.ts`
- Full suite: `pnpm check`
- Before closing: run the new frame test file 10–15 times; run `pnpm lint` if checking separately from the full suite.

### Pitfalls

- Two files require three presses to return to Build; the checklist's «дважды» covers visiting both files, not the wrap.
- The CLI prompt RPC dispatches Extension commands before submitting an agent message, including while streaming; keep the idle guard in the Pi command, not only in the keyboard action.
- Restrict the hook's current `selectedTools`, not a fresh array copied from the configured whitelist: Pi extensions can amend the selection before or after modes. Keeping the transition's candidate loadout broader than the run allowlist makes partial restrictions an explicit prompt-options edit rather than a live-loadout fallback.
- The lifecycle terminal accumulates output. Match the restored hint after a mark, not an old mode name or one appearing in a warning; confirm a new request as well.
- Do not edit the real agent dir, uninstall the personal mode, or change the user's mode files in this ticket. No additional Pi commands, tools, dependencies or hooks in unrelated Extensions.

## Comments

- Шаг 15 (ручная проверка `! bun scripts/pi-bolt-compat/run.ts` на настоящем agent dir) не выполнен — отмечен непроверенным до запуска пользователем.
- Пре-существующие падения тестов на базе `7cde9b6` (воспроизведены через `git stash`, по решению пользователя не тронуты): «user messages have no added prompt marker…» (test/design.test.ts), два `/tree` (test/session.test.ts), два скролла чата (test/chat.test.ts). `pnpm check`: 746 pass, 5 fail — ровно эти пять.
- Отклонение от списка Changes (одобрено пользователем): `test/animation.test.ts` — предикаты ожидания `columnOf(f, "Build")` заменены на `columnOf(f, "Build finished")`, потому что всегда видимый индикатор `Build` теперь совпадает с первым предикатом и перестаёт ждать тост.
- Проверка «restored Alpha at the start of the hint row» (шаг 12) сделана позиционной: инкрементальный терминальный вывод пишет патч имени режима без сепаратора (`Kalimba` пишется отдельно от ` · / commands`), поэтому подстрока «Kalimba · » в накопленном выводе не встречается; тест ищет raw-запись `\x1b[<row>;5HKalimba` (колонка начала строки подсказок) после отметки и подтверждает восстановление последующим запросом с инструкциями/tools.
- Явное решение «не усекать» для сверхдлинного имени режима: `truncate` + `wrapMode="none"` стоят, но `flexShrink={0}` — сжатие ломает «right hints truncate first» и проверку ширины 36; `maxWidth` в типизированных пропах OpenTUI нет (docs/agents/opentui.md: stay within the typed props). Длинное имя обрезается краем строки, не многоточием.
- `:next` при пропавшем файле активного режима трактуется как «переключиться на Build» (как в личном `modes.ts`: `indexOf` −1 → индекс 0 = `Build`); пикер в этом случае метит `Build (current)`.
- Имя модуля `bridge` (`modes.bridge`) оставлено по плану, хотя GLOSSARY.md избегает «Bridge» для Extension channel.
- Замечания code-review, оставлены осознанно: `fgAt` скопирован в test/modes.test.ts вместо переноса в test/harness.ts (файл вне Changes; импорт test/composer.test.ts запустил бы её тесты), `withModes`/`writeModes` дублируют запись файлов режимов в двух тестах.
- Усиление по ревью (testing.md: ждать данные Backend перед `not.toContain`): отсутствие ответа от модели проверяется после проверочного запроса `ping`, чей ответ именует свой запрос, — чужой `REPLY "/mode …"` был бы виден после ответа более позднего запроса.
- Ручная проверка `! bun scripts/pi-bolt-compat/run.ts` выполнена пользователем 2026-11-20 (Pi-Bolt 1.2.1, agent dir по умолчанию): (b) compiled-in Pi extensions в `--mode rpc` не пишут в stdout ничего кроме протокола, stderr пуст; (c) без нашего Pi extension faux-модель не получает `ask_user_question`, с `builtin/ask-user-question/pi-extension.ts` получает `ask_user`; стартовых ошибок на stderr нет, закрытие stdin завершает процесс с кодом 0. Как и предупреждал тикет, приоритет tools с rpiv не доказан: пакета rpiv в agent dir нет, секции (a) и (c) скрипта отвечают «proves nothing».
- Внешнее ревью кода (2026-11-20) после коммита. Исправлено по подтверждённым находкам: (Spec) whitelist ⊇ базового набора опирался на live loadout при no-op правке `selectedTools` — candidate loadout при заданном whitelist теперь все зарегистрированные tools, пересечение всегда видимая правка (тест с late-фикстурой `late-tool.ts`, до и после tool result); (Spec) имена с пробелами по краям и с суффиксом ` (current)` пропускаются с предупреждением — метки пикера уникальны, каждая строка выбора достижима как `/mode <name>` (тест); (Standards) предикаты `waitForFrame` покрывают все утверждения на дожданном кадре, тест переназначения проверяет состояние между Alt+M и Alt+Y через пикер, состав tools allowlist проверяется точной строкой. Оставлено осознанно: `bridge`, дубли `fgAt`/писателей, `model?: string` (ограничения плана и списка файлов); compat-скрипт по-прежнему не загружает Modes — он охватывает только замену tools, совместимость Modes с Pi-Bolt отдельно не проверена.
- Мутация фикса candidate loadout не краснеет его тест: пробный запуск показал, что при текущей семантике Pi (регистрация инструмента сразу активирует его) сценарий ревью недостижим — поздний `setActiveTools` не может вернуть инструмент вне whitelist, который избежал бы видимой правки. Фикс оставлен как защита от динамической регистрации (MCP) и будущих изменений семантики; тест фиксирует инвариант «tools хода = whitelist ровно».
- Отдельная секция (e) `bun scripts/pi-bolt-compat/run.ts` прошла на Pi-Bolt 1.2.1 с agent dir по умолчанию: `/mode` найден через `get_commands`, статус `opentui:modes/current` — `Build`, внепротокольного stdout и stderr нет, после закрытия stdin процесс вышел с кодом 0. Запрос к модели в этой секции не отправляется. Контрольный запуск без загрузки Modes дал `FAIL` и код скрипта 1.
