# 26: `/context` — расход контекста

**What to build:** Extension `context` с Pi extension внутри. `/context` открывает Modal, где видно, сколько контекстного окна текущей модели занято и чем: системный промпт, определения tools, skills, сообщения сессии, остальное — и сколько свободно. Это нативная замена вида usage из пакета `pi-context-view`, который под piu не работает: он открывает вид через `ctx.ui.custom()`, а в RPC это no-op, и пакет сообщает, что вид недоступен.

**Blocked by:** None (can start immediately).

**Status:** done

## Решения

- **Вид по правилам Swiss** (`.scratch/closed/swiss-design/`): красный (`signal`) только для того, что происходит прямо сейчас, поэтому в разбивке его нет. Категории не различаются цветом: имена, числа и доли цветами `text`, `muted` и `faint`. Пометка «оценка» цветом `faint`.

## Критерии приёмки

- [x] Modal показывает размер контекстного окна модели, занятое и свободное место и разбивку по категориям с числом токенов и долей.
- [x] Общее число занятых токенов совпадает с тем, что сообщает сам Pi о расходе контекста; если категории оцениваются, а не меряются, Modal это показывает.
- [x] Данные берутся из последнего запроса к модели. До первого запроса Modal показывает оценку по текущему состоянию сессии и говорит, что это оценка.
- [x] Во время компакции `/context` показывает сообщение, а не устаревшие данные.
- [x] Modal закрывается Esc и кликом вне него; содержимое прокручивается, если не помещается.

### Проверки

- [x] Проверка через `startPiu` с faux model: после одного хода `/context` показывает ненулевые категории системного промпта и сообщений и общий расход, равный значению Pi.
- [x] Проверка: `/context` до первого хода показывает оценку с пометкой.

## Notes

- `pi-context-view` — около 10 тысяч строк: зум, поиск, кастомизация, тихие пробные запросы. В тикет входит только разбивка по категориям; остальное — не цель.
- Пакет `pi-context-view` остаётся установленным до тикета 27. У обоих `/context`: проверить, как Pi и piu разводят команду с тем же именем, и решить это в плане тикета (дубль имени команды, в отличие от дубля имени tool, ошибкой запуска быть не должен, но это надо проверить).
- Что Pi отдаёт о расходе контекста, смотреть в установленном `@earendil-works/pi-coding-agent` (типы `ExtensionContext`, `get_session_stats` в RPC), не по памяти.
- Прочитать `docs/agents/pi-extensions.md` до начала.
- Modal выглядит как выбор модели: решение «Modal «Settings» и новые Modals» в тикете 32 (`.scratch/features/settings/issues/32-settings-modal-global-tab.md`) и `docs/agents/opentui.md`.
- Extension загружает свои `commands` и Pi extension, только если один из её Modules стоит в Placement по умолчанию. Значит, Extension нужен размещённый Module, хотя бы скрытый (`reportPresence("hidden")`), или общий prefactor, который снимает это ограничение (не заведён).

## Ticket plan

Base: `94648bb` on `main`, planned 2026-11-17.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 94648bb HEAD -- src/context-usage.ts builtin/context/usage.ts builtin/context/pi-extension.ts builtin/context/index.tsx builtin/context/modal.tsx src/pi-state.ts src/config.ts test/fixtures/pi-extensions/context-usage.ts test/context-usage.test.ts`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

Сделать Extension `context` со скрытым Module `context.host`: команда piu `/context` вызывает уникальную Pi-команду `/piu-context-usage`, а та передаёт данные и номер открытия через зарезервированный `setStatus`. Общий расход брать у Pi, категории оценивать по последнему transcript из `context_with_system`, без сетевых проб и разбора payload отдельных провайдеров; Modal читает реактивное состояние и пользуется существующей инфраструктурой.

Пользователь подтвердил ограничение: снимок категорий отражает transcript на момент нашего `context_with_system`, а не последующие изменения другими обработчиками этого события или provider-payload hooks. Это обозначить в Modal; не выдавать категории за измеренные значения. Отдельной родительской spec у `.scratch/features/extensions/` нет: контракт задают этот тикет, `.scratch/pi-opentui-mvp/spec.md`, ADR-0001 и решения Swiss из тикета 32 и `docs/agents/opentui.md`; открытый тикет 32 не является блокером.

Rejected: перехват и разбор окончательных payload каждого провайдера: расширяет тикет до поддержки нескольких форматов API, хотя критерии допускают оценку категорий. Обёртку провайдера из `/btw` тоже не копировать: наблюдение через штатный hook не перехватит побочный запрос `/btw` и не требует менять регистрацию провайдеров.

### Reuse

- `builtin/btw/index.tsx` / `BtwHost`: скопировать приём скрытого host Module и открытия Modal из реактивного состояния, но не цикл Dialog и не поток ответа.
- `src/btw.ts` / `serializeBtwThread`, `parseBtwThread`; `src/pi-state.ts` / `applyUiRequest`, `clearExtensionUi`: образец версионированного сообщения через зарезервированный status key, который не попадает в `statuses` и не рисуется на status line.
- `builtin/btw/modal.tsx` / `btwModal`: построение Panel с прокручиваемым содержимым и отдельным Footer. `src/changelog.tsx` / `changelogModal`: фокусируемое содержимое и передача клавиш предку через `scrollBoxOf`.
- `src/modal.tsx` / `ModalRequest`, `ModalLayer`, `createModals`: уже дают оформление, закрытие Esc/снаружи и восстановление фокуса; платформу Modal не менять.
- `test/harness.ts` / `startPiu`, `modalText`, `modalBounds`, `inputArea`, `panelBoxes`, `working`; `test/btw.test.ts`: отправка команд, чтение кадра, перезапуск с тем же временным `dir`. `test/fixtures/extensions/probe/index.tsx` и `hooks.probe.actions` из `test/hooks.ts`: действия Backend при открытой Modal.
- `test/swiss-modals.test.ts`: проверки `captureSpans`, `RGBA`, `TextAttributes` и `glyphs`, без собственных символов рамки.
- Установленный Pi / pi-ai 1.5.0: `ExtensionContext.getContextUsage`, `getSystemPrompt`, `sessionManager.buildSessionProjection`; `ExtensionCommandContext.getSystemPromptOptions`; `convertToLlm`, `estimateTokens`; `getCurrentSystemMessage`, `getCurrentTools`, `getSystemMessageText`, `toToolDeclaration`. Проверены в поставляемых docs и `.d.ts`; runtime-импорты Pi / pi-ai допустимы только в Pi-части, не в приложении.

### Changes

- `src/context-usage.ts` (new): константы, типы wire-данных, сериализация и пограничный разбор; без runtime-импортов Pi.
- `builtin/context/usage.ts` (new): оценка категорий transcript и согласование их суммы с расходом Pi; импортируется только Pi extension.
- `builtin/context/pi-extension.ts` (new): наблюдение запросов и жизненного цикла, внутренняя команда и публикация снимков.
- `builtin/context/index.tsx` (new): Extension, `/context`, скрытый host и управление одним экземпляром Modal.
- `builtin/context/modal.tsx` (new): содержимое и Footer Modal, вычисление свободного места и процентов.
- `src/pi-state.ts` (edit): поле `contextUsage`, перехват reserved status, очистка при смене сессии/Backend и скрытие внутренней команды из `loadCommands`; существующие сигнатуры действий и `createPiState` не менять.
- `src/config.ts` (edit): в `defaultConfig.placement.input` поставить `context.host` после `btw.side`, перед `input.prompt`; других defaults и правил merge не менять.
- `test/fixtures/pi-extensions/context-usage.ts` (new): изолированные oracle, регистрация чужой `/context`, изменения request-only контекста и управляемая компакция; не импортировать установленный `pi-context-view`.
- `test/context-usage.test.ts` (new): все новые проверки через `startPiu`; общий harness и существующие тесты не менять.

Все объявления ниже новые, кроме добавленного поля существующего `PiState`. Вспомогательные локальные имена внутри функций можно выбирать без изменения этих интерфейсов.

```ts
// src/context-usage.ts
export const CONTEXT_USAGE_COMMAND = "piu-context-usage";
export const CONTEXT_USAGE_STATUS_KEY = "opentui:context/state";
export const CONTEXT_CATEGORIES = [
  { id: "system", label: "System prompt" },
  { id: "tools", label: "Tool definitions" },
  { id: "skills", label: "Skills" },
  { id: "messages", label: "Messages" },
  { id: "other", label: "Other" },
] as const;
export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number]["id"];
export type ContextBreakdown = Readonly<Record<ContextCategory, number>>;
export type ContextUsageSnapshot = {
  readonly model: string;
  readonly contextWindow: number;
  readonly used: number;
  readonly source: "last-request" | "session-estimate";
  readonly totalSource: "pi" | "estimate";
  readonly categories: ContextBreakdown;
};
export type ContextUsageView = { readonly open: number } & (
  | { readonly kind: "ready"; readonly snapshot: ContextUsageSnapshot }
  | { readonly kind: "compacting" }
  | { readonly kind: "unavailable"; readonly reason: string }
);
export function serializeContextUsage(view: ContextUsageView): string;
export function parseContextUsage(text: string | undefined): ContextUsageView | null;

// builtin/context/usage.ts — Message из pi-ai
export function estimateContext(messages: readonly Message[]): ContextBreakdown;
export function alignContextBreakdown(
  weights: ContextBreakdown,
  used: number,
): ContextBreakdown;

// builtin/context/pi-extension.ts
type CapturedRequest = {
  readonly model: string;
  readonly categories: ContextBreakdown;
};
export default function contextUsage(pi: ExtensionAPI): void;
// Внутри contextUsage, с доступом к pi и состоянию этого экземпляра:
function sessionEstimate(ctx: ExtensionContext): ContextBreakdown;
function publish(ctx: ExtensionContext): void;
function reset(event: unknown, ctx: ExtensionContext): void;
async function openUsage(args: string, ctx: ExtensionCommandContext): Promise<void>;

// builtin/context/index.tsx — JSX из @opentui/solid
function ContextHost(props: { context: ModuleContext }): JSX.Element;
// default export: Extension, modules: [{ id: "host", render }], commands: [{ name: "context", run }]

// builtin/context/modal.tsx
export function contextUsageModal(onDismiss: () => void): ModalRequest;
function UsageContent(props: { context: ModuleContext }): JSX.Element;
function UsageFooter(props: { context: ModuleContext }): JSX.Element;

// src/pi-state.ts — новое поле PiState и соответствующего mutable store
readonly contextUsage: ContextUsageView | null;

// test/fixtures/pi-extensions/context-usage.ts
export default function contextUsageFixture(pi: ExtensionAPI): void;

// test/context-usage.test.ts — локальные test helpers
type Piu = Awaited<ReturnType<typeof startPiu>>;
type UsageFrame = {
  window: number;
  used: number;
  free: number;
  rows: Record<ContextCategory, { tokens: number; percent: number }>;
};
async function send(piu: Piu, text: string): Promise<void>;
async function openContext(piu: Piu): Promise<string>;
function readUsage(piu: Piu, frame: string): UsageFrame;
async function oracle(piu: Piu): Promise<{
  tokens: number | null;
  contextWindow: number;
}>;
```

#### Wire и открытие

- Сериализация: JSON `{ v: 1, ...view }`. `open` — положительный safe integer, увеличивается только по вызову внутренней команды; обычное обновление данных сохраняет его. До первого открытия status не публиковать, но последние категории запросов уже собирать.
- `parseContextUsage` возвращает `null` на отсутствующий/невалидный JSON, другую версию, неизвестный `kind` или неверные типы. В ready проверять непустой `model`, положительный целый `contextWindow`, неотрицательные safe integers `used` и всех пяти категорий, их сумму `=== used`, а также литералы `source` и `totalSource`. Для unavailable нужен непустой `reason`. Новые данные валидировать здесь один раз.
- Добавить `contextUsage: null` в store; reserved status разбирать до общего `statuses`. Очищать поле в `clearExtensionUi` и при терминальном `BackendHealth` в существующем health listener. В `loadCommands` исключить только `CONTEXT_USAGE_COMMAND` из ответа Backend; пользовательская `/context` остаётся.
- Extension не объявляет channels. `/context` без аргументов вызывает `void context.actions.prompt("/piu-context-usage")`; Pi-команду с именем `context` не регистрировать. В Pi 1.5.0 совпавшие Pi-команды получают invocation names `context:1`, `context:2`, а не ошибку запуска; наш путь вообще не зависит от этой нумерации. Существующий autocomplete отдаёт приоритет команде piu перед Backend-командой того же имени.
- `ContextHost` всегда сообщает `"hidden"` и возвращает пустой `<box />`. Эффект запоминает последний `open`: новый номер открывает Modal только при отсутствии уже открытой; если Modal уже есть, обновляет её данные без второго окна. Dismissal очищает сохранённую close-функцию, но не последний номер: очередной push с тем же номером не открывает закрытое окно. `null` закрывает Modal и сбрасывает номер; cleanup host тоже закрывает её.

#### Оценка и жизненный цикл Pi

- В `context_with_system` не менять event и ничего не возвращать: преобразовать `event.messages` через `convertToLlm`, сразу вычислить категории и сохранить новый `CapturedRequest`. Полный transcript не удерживать. Обновить опубликованный вид, если его уже запрашивали.
- `estimateContext`: через `getCurrentSystemMessage` свернуть изменения system sections, через `getCurrentTools` получить действующие определения. Целую структурированную `sections.skills` исключить из копии system message **до** `getSystemMessageText`, чтобы её разделители не увеличивали system. В остальных текстах system отделить полные блоки `<skills>…</skills>`, включая обёртки; для непрозрачного forced prompt это тоже работает. `skills = ceil(суммарная длина исключённой секции и этих блоков / 4)`, `system = ceil(длина оставшегося отрендеренного system текста / 4)`. Каталог не считать ещё раз в system; тела skills, прочитанные в сообщениях, остаются в messages. Tool definitions — `ceil(JSON.stringify(tools.map(toToolDeclaration)).length / 4)`, а для пустого списка — 0. Messages — сумма `estimateTokens` для всех не-system LLM messages, включая assistant thinking, tool calls и tool results. Начальный `other` — 0. Никакого нового tokenizer.
- `sessionEstimate`: взять `convertToLlm(ctx.sessionManager.buildSessionProjection().messages)`. Если там есть system message, оценивать эту проекцию. Если нет — добавить синтетический leading system message с `ctx.getSystemPrompt()`, `timestamp: 0` и определениями активных tools из `pi.getAllTools()`, отобранных по `pi.getActiveTools()` без hidden tools. Hidden names сохранять из `before_agent_start.systemPromptOptions.hiddenTools`; при вызове команды уточнять их через `ctx.getSystemPromptOptions()`. Не читать файлы навыков или пакетов.
- `publish`: во время наблюдаемой компакции передавать только `kind: "compacting"`. Иначе выбрать последний запрос текущей модели или `sessionEstimate`, указав соответствующий `source`; `model` — `provider/id`. Окно брать из `ctx.getContextUsage()?.contextWindow`, при его отсутствии — из `ctx.model?.contextWindow`. Нет модели/положительного окна — unavailable с причиной `Context window unavailable.` без фиктивных чисел.
- Положительный `ctx.getContextUsage().tokens` использовать без изменения, `totalSource: "pi"`. При `null`/`undefined` или нуле до получения расхода использовать сумму оценок и `totalSource: "estimate"`. Это относится к пустой сессии, первому запросу до ответа и периоду после компакции; не показывать нулевой расход при уже ненулевом prompt. Не использовать накопленные billed tokens из `get_session_stats.tokens`.
- `alignContextBreakdown`: если сумма четырёх именованных категорий не больше `used`, сохранить их, разницу отдать other. Если больше — пропорционально уменьшить четыре категории: взять floors, оставшиеся единицы распределить по убыванию дробной части, при равенстве — в порядке `CONTEXT_CATEGORIES`; other = 0. Если веса нулевые — всё отдать other. Сумма всегда равна `used`, отрицательных значений нет.
- Обновлять расход на `turn_end` и `agent_settled`, а не только на `message_end`: в Pi 1.5.0 extension hook `message_end` вызывается до сохранения сообщения, и `getContextUsage()` в нём ещё не видит последнюю usage. При каждом новом запросе обновлять категории; прямой запрос `/btw` не проходит `context_with_system` и не заменяет основной снимок.
- `session_start`, `session_tree`, `session_shutdown`: `reset`, очистка последнего запроса, счётчика открытий и reserved status. На `model_select` забыть категории прежней модели и обновить открытый вид по текущей проекции без открытия новой Modal; в `publish` также не использовать сохранённый запрос другой модели.
- `session_before_compact`: запомнить `event.signal`, публиковать compacting, следить за abort с проверкой идентичности signal. `session_compact`: снять флаг, забыть снимок запроса, пересчитать текущую проекцию; до следующей usage Pi вправе вернуть `tokens: null`, тогда показывать оценку. `session_compact_failed`: снять флаг и обновить данные, сохранив последний запрос. На reset снимать обработчик abort; старый signal не должен обновить новую сессию.

#### Modal

- Panel `context-usage`, два Module: `context.usage` с title `Context`, затем `context.hints` с `footer: true`, `minHeight: 1`. Размер `width: "75%"`, `height: "75%"`, без `left/top`, без followsOutput; существующий SlotView обеспечивает scrolling и Swiss sheet.
- `UsageContent` читает `context.pi.contextUsage` реактивно. Пока есть активная compaction service row **или** wire kind compacting, показывать только `Compacting context…` вместо чисел. Так закрывается и промежуток до нашего Pi hook, если чужой обработчик компакции задержался. Для unavailable показать reason цветом `muted`.
- Ready: строки `Model: <provider/id>`, `Window: <N> tokens`, `Used: <N> tokens (<P>%)`, `Free: <N> tokens (<P>%)`, пустая строка, `Breakdown · estimated`, затем все пять категорий в установленном порядке, включая нули. Числа целые без сокращений и locale separators; проценты — от полного окна, один знак после точки. Free = `max(0, contextWindow - used)`, used не обрезать по размеру окна.
- Имена и числа — `text`, проценты — `muted`; `estimated`, источник `Last request` / `Session estimate`, пояснения `Total from Pi` / `Total estimated from the session` — `faint`. Ни одной категории не давать `signal`, `accent` или собственный цвет.
- Под таблицей faint-пояснения: `Categories estimate Pi's transcript, not the final provider payload.`, `Skills counts the catalogue; loaded skill bodies remain Messages.`, `Other includes the latest response and unassigned overhead.` При `context.pi.working` добавить `Request in progress; Pi usage updates after the response.`
- Контент — фокусируемый `<box focused focusable>`; в `onKeyDown` искать scroll-предка через `scrollBoxOf`, как в changelog, передавать arrows / PageUp / PageDown в `handleKeyPress`, Ctrl+Home / Ctrl+End — в `scrollTo(0 / Infinity)`. Не искать предка внутри ref. Footer справа цветом `faint`: `↑↓ / PgUp PgDn scroll   esc close`; он не прокручивается. Закрытие оставить `ModalLayer`, передав callback для очистки close-функции host.

#### Test fixture

- Подключать новый Pi fixture через `installedPiExtensions`. Он использует только stdlib и type imports Pi: скопированная в temp agent dir Pi extension не должна искать runtime-зависимости репозитория.
- Всегда регистрировать `/context-oracle`: записать результат `ctx.getContextUsage()` в `${process.env.PIU_FAUX_SCRIPT}.context-oracle.json`; это независимый ответ Pi, не чтение store приложения. `oracle(piu)` вызывает команду через probe actions, ждёт завершения prompt и читает этот файл. Нужен стандартный probe в `placement.status` и `extensions` из существующих fixtures.
- Всегда регистрировать чужую Pi-команду `/context` с уведомлением `Installed context command invoked`. Это fixture регистрации команды, не копия всего пакета. Реальная регистрация и RPC-refusal проверены в установленном `pi-context-view` 0.8.3; runtime capture/probe/UI этого пакета не воспроизводить.
- `PIU_CONTEXT_TRANSIENT=1`: в `context` добавить к тексту последнего user message строку `REQUEST_ONLY_` и 8192 символа `x`, только в event, не в session manager.
- `PIU_CONTEXT_SKILLS=1`: в `before_agent_start` задать `event.systemPromptOptions.sections.skills` строкой из 4096 символов `k`.
- `PIU_CONTEXT_MINIMAL=1`: в `before_agent_start` обнулить `selectedTools` и вернуть принудительный system prompt: 400 символов `s`, затем `<skills>`, 16 символов `k`, `</skills>`. Это даёт известные веса system = 100, skills = 9; prompt `UUUU` даёт messages = 1.
- `PIU_CONTEXT_USAGE_TOTAL=<N>`: в `message_end` только для успешно завершённого assistant заменить usage: input/totalTokens = N, output/cacheRead/cacheWrite = 0, все cost = 0. Вернуть `{ message }` штатным результатом hook; oracle после сохранения видит эти же данные.
- `PIU_CONTEXT_COMPACTION_GATE=1`: в `session_before_compact` записать `${PIU_FAUX_SCRIPT}.context-compacting`, затем ждать `${PIU_FAUX_SCRIPT}.context-release`, пока signal не aborted и script file существует; polling 20 ms. Тест снимает gate записью release-файла. Это управляемая задержка, а не фиксированный sleep и не зависимость от настоящей модели.

### Steps

Seam: публичные Config, команды/клавиши/мышь `startPiu` и видимый кадр, с настоящим изолированным Pi и faux model; расход сверять с независимой командой oracle. Model test: `test/btw.test.ts`, `without a recorded request the side question is built from the session branch`. Новые сценарии находятся только в `test/context-usage.test.ts`; основной размер тестов 160×42, для scrolling — 100×20. Каждый пункт ниже — один тест: сначала увидеть ожидаемый red, затем минимальный green; готовые без изменений сценарии проверять целевой мутацией по `docs/agents/testing.md`.

1. Test `"context before the first turn is an estimate and does not call the model"`: открыть `/context` до хода; есть окно, положительные system/tools, нулевые messages, `Session estimate` и `Total estimated from the session`. Закрыть, послать обычный prompt: модель выдаёт первую, а не следующую scripted reply, в истории ровно один user prompt. Red, then green через новые wire/Pi/host/Modal и Placement. Check: `bun test test/context-usage.test.ts -t '^context before the first turn is an estimate and does not call the model$'`.
2. Test `"context after a turn agrees with Pi including cached and output tokens"`: один обычный ход с длинным ответом; после settled открыть Modal, сравнить used/window с oracle. System, tools, messages и other положительны, сумма пяти категорий равна used, free и проценты верны, есть `Last request`, `Total from Pi` и `estimated`; JSON status нигде не нарисован. Red, then green в `usage.ts`, Pi publisher, parser и Modal. Check: `bun test test/context-usage.test.ts -t '^context after a turn agrees with Pi including cached and output tokens$'`.
3. Test `"skills are separate from the system prompt"`: fixture с `PIU_CONTEXT_SKILLS=1`, один ход; skills = `ceil(длина обёрнутой секции / 4)` и положительны, категории в сумме ровно used. В двух изолированных запусках с одинаковым prompt сравнить обычный и skills-вариант: добавление каталога увеличивает skills, но не system. Red, then green в `estimateContext`. Check: `bun test test/context-usage.test.ts -t '^skills are separate from the system prompt$'`.
4. Test `"context includes request-only messages absent from the saved session"`: `persistSession`, `PIU_CONTEXT_TRANSIENT=1`; после хода messages > 2048 токенов, хотя session JSONL содержит исходный prompt и не содержит `REQUEST_ONLY_`. Отображаемый used равен oracle. Red, then green в `context_with_system` capture, не подменять его чтением сохранённой истории. Check: `bun test test/context-usage.test.ts -t '^context includes request-only messages absent from the saved session$'`.
5. Test `"category estimates scale to a smaller Pi total without losing tokens"`: `PIU_CONTEXT_MINIMAL=1`, `PIU_CONTEXT_USAGE_TOTAL=7`, user prompt `UUUU`, затем `/context`. Oracle и used = 7; system = 6, skills = 1, tools/messages/other = 0, free = window − 7; проценты соответствуют числам. Red, then green в `alignContextBreakdown`; порядок распределения остатка фиксирован выше. Check: `bun test test/context-usage.test.ts -t '^category estimates scale to a smaller Pi total without losing tokens$'`.
6. Test `"context describes the final request after a tool result"`: faux сначала вызывает bash, который выводит 8192 символа, затем отвечает `Final reply`; после settled messages > 2048 и общий расход равен oracle. Это отличает последний запрос от первого запроса хода. Red, then green в capture/refresh lifecycle. Check: `bun test test/context-usage.test.ts -t '^context describes the final request after a tool result$'`.
7. Test `"btw does not replace the main context snapshot"`: сделать основной ход, записать все числа `/context`; через probe вызвать `/btw` с длинным вопросом, дождаться side answer, закрыть только верхнюю Modal. Исходная Context Modal показывает прежние числа и тот же oracle total. Red, then green в границе наблюдения основного запроса; не добавлять provider wrapper. Check: `bun test test/context-usage.test.ts -t '^btw does not replace the main context snapshot$'`.
8. Test `"piu context wins over an installed command and hides its transport command"`: по `/context` дождаться строки `/context-oracle` как подтверждения загрузки Backend-команд и проверить ровно одну строку с точным именем `/context`. Исполнение `/context` открывает наш Modal без sentinel-уведомления и без хода модели. После закрытия запрос `/piu-context` не показывает внутреннюю команду в autocomplete. Red, then green в Extension command и `loadCommands`; существующий роутинг input не менять. Check: `bun test test/context-usage.test.ts -t '^piu context wins over an installed command and hides its transport command$'`.
9. Test `"manual compaction hides numbers then shows a fresh session estimate"`: после двух ходов запустить `hooks.probe.actions.compact()` с gate и открыть `/context` до release. В Modal только `Compacting context…`, нет Used/категорий; после release дождаться успешной компакции и, не переоткрывая окно, `Session estimate`, без старого total. Oracle.tokens = null; после закрытия, следующего хода и открытия снова used равен oracle и источник `Last request`. Red, then green в compaction lifecycle и reactive Modal. Check: `bun test test/context-usage.test.ts --timeout 20000 -t '^manual compaction hides numbers then shows a fresh session estimate$'`.
10. Test `"automatic compaction hides numbers while its gate is held"`: `contextWindow: 10000`, fixture usage total = 20000 и gate. Первый ответ вызывает настоящую threshold compaction; во время gate `/context` открывается, но не показывает старые числа. После release успешно переходит к оценке без ручного compact. На compaction предусмотреть две scripted replies после первого ответа. Red, then green тем же lifecycle, не отдельным UI-флагом ручной компакции. Check: `bun test test/context-usage.test.ts --timeout 20000 -t '^automatic compaction hides numbers while its gate is held$'`.
11. Test `"failed compaction restores the last request instead of staying busy"`: обычные ходы, gate и ошибка faux `400 invalid request` при суммаризации. Открытая Modal сначала скрывает числа; после release и отказа снова показывает Last request и used, равный oracle, а не вечное compacting или session estimate из несуществующей summary. Red, then green в `session_compact_failed`/abort cleanup. Check: `bun test test/context-usage.test.ts --timeout 20000 -t '^failed compaction restores the last request instead of staying busy$'`.
12. Test `"a new session closes context and forgets the old request"`: открыть после хода, через probe выполнить `newSession`; Modal закрывается. Новая `/context` показывает session estimate, messages = 0; следующий обычный prompt имеет одну user message. Red, then green в reset/`clearExtensionUi`/host cleanup. Check: `bun test test/context-usage.test.ts -t '^a new session closes context and forgets the old request$'`.
13. Test `"resuming a session estimates its current projection until a new request"`: повторить схему model test с общим временным dir, `persistSession` и `-c`. До нового хода `/context` показывает `Session estimate`, ненулевые messages и used, равный oracle; после хода — `Last request`. Не хранить снимок запроса на диске. Red, then green в `sessionEstimate`/reset. Check: `bun test test/context-usage.test.ts --timeout 20000 -t '^resuming a session estimates its current projection until a new request$'`.
14. Test `"changing the model refreshes context without reopening it"`: `sameIdProvider: true`, окно faux = 10000; после хода открыть Modal, через probe выбрать `other/faux-1`. Та же единственная Modal показывает другую модель, её oracle contextWindow, source `Session estimate`; старая разбивка запроса больше не отмечена Last request. Red, then green в `model_select` и проверке модели publisher. Check: `bun test test/context-usage.test.ts -t '^changing the model refreshes context without reopening it$'`.
15. Test `"Escape closes context and returns typing to the input"`: Esc закрывает Modal; после ввода ASCII-маркера без Enter он виден в `inputArea`, не отправлен модели. Через probe послать другой обычный prompt и дождаться его ответа: обновление данных с тем же open не открывает окно снова, маркер остаётся в input. Удалить маркер Backspace по символу; новая `/context` открывает Modal. Red, then green в host dismissal. Check: `bun test test/context-usage.test.ts -t '^Escape closes context and returns typing to the input$'`.
16. Test `"an outside click closes context and returns typing to the input"`: те же проверки, но закрывать кликом по координате вне `modalBounds`. Независимо проверить мышиный путь, не нажимать Esc. Red, then green в callback host/существующей Modal dismissal. Check: `bun test test/context-usage.test.ts -t '^an outside click closes context and returns typing to the input$'`.
17. Test `"context scrolls with arrow and paging keys while hints stay fixed"`: терминал 100×20; сначала видны верхние строки, нижнее пояснение не помещается. ArrowDown/PageDown и Ctrl+End открывают нижнее пояснение; ArrowUp/PageUp и Ctrl+Home возвращают Model/Window. Footer остаётся на той же строке. Red, then green в `UsageContent` keyboard forwarding и Footer. Check: `bun test test/context-usage.test.ts -t '^context scrolls with arrow and paging keys while hints stay fixed$'`.
18. Test `"the wheel scrolls context instead of the chat"`: те же размеры, колесо над Modal открывает нижнее пояснение; после закрытия текст и позиция chat не изменились. Red, then green через существующий Panel scrollbox, без собственного wheel handler. Check: `bun test test/context-usage.test.ts -t '^the wheel scrolls context instead of the chat$'`.
19. Test `"context keeps Swiss colors and resizes with the terminal"`: light terminal, проверить fill surface, тяжёлую rule/text, жирный title/text, faint esc/estimated, text у имён/чисел и muted у процентов; в строках категорий нет signal. `modalBounds` дают центр и 75% каждого размера с допустимым округлением в одну ячейку; `renderer.resize` сохраняет центр/доли и доступность содержимого. Red, then green в Modal props и theme bindings, не в общих sheet/layout. Check: `bun test test/context-usage.test.ts -t '^context keeps Swiss colors and resizes with the terminal$'`.
20. Test `"a malformed context status is neither shown nor opened"`: faux `ui` tool посылает reserved setStatus с невалидным JSON, затем обычный ответ-маркер. Дождаться ответа, проверить отсутствие wire-текста и Modal, работоспособность ввода; затем обычная `/context` успешно открывает валидный вид. Red, then green в parser и reserved status routing. Check: `bun test test/context-usage.test.ts -t '^a malformed context status is neither shown nor opened$'`.
21. Изменение без отдельного runtime-сценария: сверить все новые exports, default Placement, отсутствие новых зависимостей, изменений личного Config, channels и provider wrappers. Check: `pnpm typecheck` и `pnpm exec biome check src/context-usage.ts builtin/context src/pi-state.ts src/config.ts test/fixtures/pi-extensions/context-usage.ts test/context-usage.test.ts`.
22. Проверка устойчивости: новый файл frame tests прогнать 10 раз подряд с `--timeout 20000`, останавливаясь на первом падении; затем affected suites `test/btw.test.ts`, `test/autocomplete.test.ts`, `test/config.test.ts`, `test/extension-ui.test.ts`, `test/session.test.ts`, `test/modal.test.ts`. После этого — `pnpm check` отдельно. Не запускать dev/build.

### Commands

- Typecheck: `pnpm typecheck`.
- One test file: `bun test test/context-usage.test.ts --timeout 20000`.
- Full suite: `pnpm check` (typecheck, Biome, все Bun tests; tool timeout 600000).
- Model test, проверен на базе: `bun test test/btw.test.ts -t '^without a recorded request the side question is built from the session branch$'` — 1 pass, 19 filtered out, 0 fail.
- Affected suites: `bun test test/btw.test.ts test/autocomplete.test.ts test/config.test.ts test/extension-ui.test.ts test/session.test.ts test/modal.test.ts --timeout 20000`.
- Pi-Bolt, вручную пользователем вне sandbox сразу после первого работающего Pi-side среза: `PIU_COMPAT_ARGS="-e $PWD/builtin/context/pi-extension.ts" bun scripts/pi-bolt-compat/run.ts`. Это включает новую Pi extension в существующий compatibility probe; не выдавать обычный запуск старого probe без неё за проверку этого тикета. Затем в настоящем piu с установленным `pi-context-view` проверить `/context` до/после хода. Автотесты используют только временный agent dir и stand-ins.

### Pitfalls

- В Pi `get_session_stats.tokens` — накопленная оплата всей сессии; это не занятое окно. `getContextUsage()` включает последний ответ и cache tokens и сам может быть оценкой; надпись должна быть `Total from Pi`, не «точное измерение провайдера».
- После компакции Pi возвращает `tokens: null` до следующего ответа. Не подставлять старую usage и не превращать null в ноль. Открытая Modal должна обновиться сама, не остаться на снимке до компакции.
- Hook `message_end` ещё не видит собственное сообщение в сохранённой проекции. Перенос чтения расхода на `turn_end`/`agent_settled` — обязательное решение, не таймер и не повторный запрос через sleep.
- Порядок загрузки чужих `context_with_system` handlers и переписывания payload не контролируется: это согласованная граница оценки. Не импортировать из `pi-context-view`, не включать его silent probing и не снимать его с установки в этом тикете.
- Fixture `/context` проверяет диспетчеризацию, а не совместимость всего установленного пакета или Pi-Bolt. Ручной Pi-Bolt check остаётся непроверенным до результата пользователя; sandbox с известным `EACCES` на `~/.pi/agent/trust.json.lock` обходить нельзя.
- Host нельзя удалить как «пустой компонент»: без него Extension, её команда и Pi extension не загрузятся. Но hidden host не должен менять геометрию input/status; это видно в существующих affected suites.
- Во frame-проверках источник и все проверяемые строки должны уже быть видимы. Для малой Modal прокрутить к ним, не ждать текста, скрытого за viewport или другой Modal; под верхней `/btw` не ждать Context-текст.

## Comments

- **Отклонение шага 5 плана.** Pi 1.5.0 применяет `systemPrompt` из `before_agent_start` в `agent.transformContext` (`_installAgentForcedPromptProjection`) уже после `runner.emitContext`, а установленные `docs/extensions.md` это и описывают («forced … is still projected onto the request afterwards»). `context_with_system` forced prompt не видит. Поэтому фикстура `PIU_CONTEXT_MINIMAL` только обнуляет `selectedTools`; сценарий через `startPiu` проверяет свойства (used = 7 = oracle, сумма категорий = 7, tools = 0), а точные числа — прямые тесты в `test/context-usage.test.ts`: `alignContextBreakdown` (веса 100/0/9/1 при Pi-total 7 → system 6, skills 1) и `estimateContext` для непрозрачного промпта (400 символов + `<skills>`-блок → system 100, skills 9). Вторая проверка закрывает ветку `<skills>` в `content`, которая иначе оставалась без теста.
- **Шаг 7 («btw не заменяет снимок») — сторож инварианта, а не проверка ветки.** Побочный запрос `/btw` не проходит ни `context_with_system`, ни `publish`, поэтому мутации этого кода тест не краснят (проверены обёртка провайдера по образцу btw и `publish` на `before_provider_request`). Тест оставлен по плану: он поймает будущий возврат к отклонённому варианту (наблюдение через обёртку провайдера).
- **Шаг 12:** `/new` перезагружает Pi extension, поэтому новый экземпляр забывает снимок сам; мутация любого из двух механизмов (`clearExtensionUi` и reset на `session_start`) по отдельности оставляет тест зелёным — проверяется видимый результат, а не путь.
- **Компакция:** числа скрывают два механизма — `kind: "compacting"` в wire и активная compaction service row приложения. Тесты 9–10 краснеют только при снятии обоих; wire-ветка отдельно доказана тестом 11 (service row там уже завершена). Это соответствует решению плана держать оба.
- **`try/catch` в `publish`/`clearStatus`** — по образцу `builtin/btw/modal.tsx`; проверено, что устаревший ctx действительно бросает: геттер `ctx.ui` и методы `getContextUsage`/`getSystemPrompt` вызывают `runner.assertActive()`.
- **Экспорты сверх списка плана:** `CONTEXT_USAGE_DESCRIPTION` (общий текст команды piu и скрытой команды Pi) и `contextTotal` (сумма пяти категорий в одном месте — используется парсером и Pi extension вместо двух ручных сумм).
- **Дубль `scrollKeys` устранён:** общая функция вынесена в `src/scroll.ts` и используется обоими Modal (/btw и /context); `builtin/btw/modal.tsx` изменился только импортом и вызовом, поведение то же (тесты btw зелёные).
- **Pi-Bolt:** `PIU_COMPAT_ARGS="-e $PWD/builtin/context/pi-extension.ts" bun scripts/pi-bolt-compat/run.ts` прогнан на Pi-Bolt 1.5.2 (Pi-Bolt 1.2.1): новая Pi extension загрузилась без ошибок и не добавила tool, RPC-probe прошёл. Сам `/context` этот probe не упражняет; ручная проверка в настоящем piu с установленным `pi-context-view` (до и после хода) остаётся за пользователем.
- **Проверки:** `test/context-usage.test.ts` — 22 pass, 10 прогонов подряд без падений; `pnpm typecheck` и Biome чисто; полный `pnpm check` — 573–578 pass, 4 fail: два `/tree` в `test/session.test.ts` и два scroll-теста в `test/chat.test.ts` воспроизводятся на чистом worktree `HEAD`; пятое падение меняется от прогона к прогону (`copy-on-select`, `background`, scroll-тесты) — это флейки под нагрузкой: `test/background.test.ts` по отдельности три прогона подряд зелёный, а `test/copy-on-select.test.ts` падает и на чистом `HEAD`.
- **Ревью, изменения вне списка Changes.** `src/scroll.ts` и `builtin/btw/modal.tsx` оставлены осознанно: мой `scrollKeys` был дословной копией btw-шного, а глобальное правило «одно решение в одном месте» важнее буквы списка файлов; поведение btw не изменилось (его тесты зелёные). Если это нежелательно — откат сводится к возврату локальной функции в `builtin/context/modal.tsx`.
- **Ревью, вид Modal.** `summary()` добавляет шестую строку `Last request · Total from Pi` (или `Session estimate · Total estimated from the session`): план перечислял пять строк, но источник снимка и «итог от Pi» надо где-то показать, а пояснения под таблицей из плана остались. Строка `Breakdown · estimated` целиком цветом `faint`, включая слово «Breakdown», — это Swiss-пометка оценки.
- **Ревью, следствие forced prompt.** Если другая Pi extension подменяет системный промпт через `before_agent_start`, «Last request» считает структурные секции transcript, а не подменённый текст; пояснение `Categories estimate Pi's transcript, not the final provider payload.` покрывает это лишь частично.
- **Ревью, мелкие правки.** Общий `isRecord` вынесен в `src/json.ts` и используется `src/btw.ts` и `src/context-usage.ts`; `snapshot()` возвращает `null` вместо строки-сентинела; локальные имена уточнены (`lastOpen`, `forgetClose`, `namedCategories`, `empty`). `onDismiss` нельзя передать в `ModalRequest` напрямую — тип требует `boolean | undefined`, поэтому обёртка остаётся.
- **После ручной проверки пользователь попросил сократить числа** (`1000000` → `1M`, `200000` → `200k`, `5858` → `5.9k`), это отменяет строку плана «Числа целые без сокращений и locale separators». Добавлен `formatTokens` (`src/context-usage.ts`): до 1000 — точно, до 10 000 — один знак (`5.9k`, хвостовой `.0` снимается), до 1 000 000 — округлённые тысячи (`200k`), дальше `1M` и `1.2M`; `k` строчная, как в нижней строке Pi, `M` заглавная. Числа колонки категорий выровнены по правому краю. Кадровые тесты сравнивают сокращённую форму с тем же `formatTokens` и проценты — с точными числами oracle; точные суммы категорий и оценку skills по-прежнему держат юнит-тесты `alignContextBreakdown` и `estimateContext` (включая секцию `skills` и непрозрачный промпт).
