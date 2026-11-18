# 27: `/context injections` — что попало в запрос

**What to build:** `/context injections` открывает в Modal список скрытых частей последнего запроса к модели: системный промпт по разделам, определения tools и то, что добавили Pi extensions, включая правки, которые они вносят только в запрос к модели. Выбор строки показывает её полный текст. После этого тикета пакет `pi-context-view` больше не нужен.

**Blocked by:** 26 (`/context` — расход контекста).

**Status:** done

## Критерии приёмки

- [x] Список содержит разделы системного промпта, каждое определение tool и каждый вклад Pi extension в последний запрос, с размером в токенах.
- [x] Выбор строки (Enter или клик) показывает полный текст; Esc возвращает к списку, второй Esc закрывает Modal.
- [x] Правки, которые Pi extension внёс только в запрос к модели (а не в сессию), видны и помечены.
- [x] До первого запроса Modal говорит, что запроса ещё не было.
- [x] Переключение между usage и injections внутри одного Modal работает без повторного ввода команды.

### Проверки

- [x] Проверка через `startPiu` с faux model и тестовым Pi extension, который добавляет раздел в системный промпт в `before_agent_start`: после хода раздел есть в списке, его текст открывается.
- [x] Проверка: список tools совпадает с tools, которые faux model получила в запросе.

## Notes

- Modal выглядит как выбор модели: решение «Modal «Settings» и новые Modals» в тикете 32 (`.scratch/features/settings/issues/32-settings-modal-global-tab.md`) и `docs/agents/opentui.md`.
- Как `pi-context-view` ловит итоговый запрос (порядок хуков, захват до и после чужих Pi extensions), посмотреть в его исходниках в установленном пакете и повторить только нужное.

## После приёмки (вручную)

- [x] Удалить пакет `pi-context-view` (`pi-bolt remove npm:pi-context-view`) и пересобрать Pi-Bolt (`pi-bolt compile`).

## Ticket plan

Base: `213b980` on `main`, planned 2026-11-17.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 213b980 HEAD -- src/context-usage.ts builtin/context/injections.ts builtin/context/pi-extension.ts builtin/context/index.tsx builtin/context/modal.tsx builtin/context/injections-view.tsx src/tabs.tsx builtin/model/index.tsx src/module.ts src/layout.tsx src/pi-state.ts test/fixtures/pi-extensions/context-usage.ts test/context-injections.test.ts test/context-usage.test.ts docs/agents/pi-extensions.md docs/agents/opentui.md`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

Pi extension `context` (тикет 26) в уже существующем `context_with_system` синхронно собирает список injections последнего запроса: разделы системного промпта в том виде, в каком они ушли в запрос, определения tools без скрытых, custom-сообщения Pi extensions и правки только в запросе. Правки находятся сравнением запроса с `ctx.sessionManager.buildSessionProjection().messages`: сообщения, добавленные, изменённые или удалённые хуками `context`, плюс подменённый промпт из `before_agent_start`, когда `ctx.getSystemPrompt()` не совпадает с промптом сессии. Список уходит отдельным зарезервированным ключом `opentui:context/injections` только при новом запросе и при открытии, а не на каждом `turn_end`, потому что тексты большие. Modal `/context` получает вкладки Usage | Injections (общий компонент `src/tabs.tsx`, вынесенный из выбора модели, как решено в тикете 32), закреплённые новым флагом Module `header`. Injections — список в стиле выбора модели: Enter или клик открывают полный текст, Esc в тексте возвращает к списку (`onDismiss` → `false`).

Пользователь подтвердил границу: piu передаёт свои Pi extensions через `-e`, а Pi загружает их раньше установленных (`mergePaths(cliEnabledExtensions, enabledExtensions)` в `dist/core/resource-loader.js`). Поэтому правки `context_with_system` от расширений, загруженных после нас, и переписывание payload провайдера не видны. Это пишется строкой в Modal и в `docs/agents/pi-extensions.md`. Сравнение разделов и tools «только в запросе» не делать: при таком порядке ему нечего ловить. Из установленных пакетов автора `context_with_system` использует только сам `pi-context-view`, а `context` у pi-subagents сообщения не меняет.

Rejected: обёртка провайдера, как в `/btw`: она видит итоговый запрос после всех хуков, но обёртки `/btw` и `context` на каждом ходу заново оборачивали бы друг друга (`wrapped` у каждой своя), и цепочка росла бы; чтобы это исправить, пришлось бы переделать `/btw` на общую шину.

### Reuse

- `builtin/context/pi-extension.ts`: `hiddenTools`, `open`, `publish`/`clearStatus` с `try/catch` для устаревшего ctx, `reset`. Новую публикацию строить по их образцу.
- `builtin/context/usage.ts`: тот же способ оценки (`Math.ceil(chars / 4)`, `estimateTokens`, `toToolDeclaration`), чтобы числа совпадали с вкладкой Usage.
- `src/context-usage.ts`: `isCount`, `isRecord`, стиль `parseContextUsage` для нового парсера. `formatTokens` для чисел в строках.
- `builtin/model/index.tsx`: разметка вкладок (переносится в `src/tabs.tsx`) и строк списка (`theme.bar`/`barText`/`barMuted`, `scrollIntoView` в `queueMicrotask`).
- `src/scroll.ts`: `scrollKeys` для прокрутки текста, `scrollIntoView` для выбранной строки.
- `src/modal.tsx`: `ModalRequest.onDismiss(reason)`, где `false` оставляет Modal открытым.
- `test/context-usage.test.ts`: приёмы `send`, `fixture`, `hooks.probe.actions.newSession()`, ui tool с `setStatus` для невалидного статуса. `test/harness.ts`: `startPiu`, `modalText`, `modalBounds`, `inputArea`, `panelText`, `working`, `backendEnv`. Подстановка `{tools}` в `test/fixtures/faux-backend.ts` даёт имена tools, которые получила faux model.
- `pi-context-view` 0.8.3 (`~/.pi/agent/npm/node_modules/pi-context-view/src/capture/diff.ts`, `modelFacingPart`/`sameMessage`; `capture/request.ts`, `detectForcedPrompt`): только идея сравнения. Не импортировать.

### Changes

- `src/context-usage.ts` (edit): `ContextTab`, поле `tab` в `ContextUsageView` и его проверка в `parseContextUsage`; типы, ключ, сериализация и разбор injections; новый текст `CONTEXT_USAGE_DESCRIPTION`.
- `builtin/context/injections.ts` (new): `collectInjections` и её помощники; импорты Pi / pi-ai только здесь и в `pi-extension.ts`.
- `builtin/context/pi-extension.ts` (edit): захват injections в `context_with_system`, `tab` из аргумента команды, публикация и очистка нового ключа.
- `builtin/context/index.tsx` (edit): разбор аргумента `/context`, состояние Modal в host, переключение вкладки при новом `open`.
- `builtin/context/modal.tsx` (edit): состояние Modal, три Module (view, tabs header, hints footer), переключение вкладок ←/→, `onDismiss` для текста.
- `builtin/context/injections-view.tsx` (new): список и полный текст.
- `src/tabs.tsx` (new): `Tabs`. `builtin/model/index.tsx` (edit): использовать `Tabs`, удалить осиротевшие `TAB_GAP`, `CONTENT_WIDTH`, `tabsWidth`, вид не меняется.
- `src/module.ts` (edit): `header?: boolean` в `Module`. `src/layout.tsx` (edit): header Modules в прокручиваемой Panel рисуются над scrollbox, вне прокрутки; в ветке `"content"`/`bar` ничего не меняется.
- `src/pi-state.ts` (edit): поле `contextInjections`, разбор ключа до общего `statuses`, очистка в `clearExtensionUi` и в health listener рядом с `contextUsage`.
- `test/fixtures/pi-extensions/context-usage.ts` (edit): `PIU_CONTEXT_SECTION`, `PIU_CONTEXT_MESSAGE`, `PIU_CONTEXT_FORCED` в `before_agent_start`; прежние ветки не трогать.
- `test/context-injections.test.ts` (new): все новые сценарии. `test/context-usage.test.ts` (edit) только если старые кадры сдвинет полоса вкладок: поправить расположение, не ослабляя проверки.
- `docs/agents/pi-extensions.md` (edit): новый пункт о порядке загрузки. `docs/agents/opentui.md` (edit): в пункте «A scrolling Panel carries its padding…» добавить header Modules (над scrollbox) к footer.
- `.scratch/features/settings/issues/32-settings-modal-global-tab.md` (edit, трекер): комментарий `From 27:` в `## Comments` (создать раздел в конце): вкладки уже вынесены в `src/tabs.tsx`, у Module есть флаг `header`.

```ts
// src/context-usage.ts — добавить
export const CONTEXT_INJECTIONS_STATUS_KEY = "opentui:context/injections";
export const CONTEXT_TABS = ["usage", "injections"] as const;
export type ContextTab = (typeof CONTEXT_TABS)[number];
// ContextUsageView: к { readonly open: number } добавить readonly tab: ContextTab
export type InjectionGroup = "system" | "tools" | "messages";
export type RequestOnlyChange = "added" | "changed" | "removed" | "forced";
export type ContextInjection = {
  readonly group: InjectionGroup;
  readonly name: string;          // имя раздела, tool, customType или role
  readonly origin: string;        // "Pi", "extension" или источник tool
  readonly tokens: number;
  readonly text: string;
  readonly requestOnly?: RequestOnlyChange; // нет — сохранено в сессии
};
export type ContextInjections = { readonly items: readonly ContextInjection[] };
export function serializeContextInjections(value: ContextInjections): string; // JSON { v: 1, items }
export function parseContextInjections(text: string | undefined): ContextInjections | null;
// CONTEXT_USAGE_DESCRIPTION = "Show context window usage and the last request's injections"

// builtin/context/injections.ts
type RequestMessage = ContextWithSystemEvent["messages"][number];
export type InjectionsInput = {
  readonly request: readonly RequestMessage[];   // event.messages
  readonly session: readonly RequestMessage[];   // buildSessionProjection().messages
  readonly effectivePrompt: string;              // ctx.getSystemPrompt()
  readonly hiddenTools: readonly string[];
  readonly tools: readonly ToolInfo[];           // pi.getAllTools()
};
export function collectInjections(input: InjectionsInput): ContextInjection[];
function toolOrigin(info: ToolInfo): string;
function messageKey(message: RequestMessage): string;
function messageText(message: RequestMessage): string;

// builtin/context/pi-extension.ts — внутри contextUsage
let injections: ContextInjections | undefined;
let tab: ContextTab = "usage";
function publishInjections(ctx: ExtensionContext): void;

// src/tabs.tsx
export function Tabs<T extends string>(props: {
  tabs: readonly T[];
  active: T;
  theme: Theme;
  label?: (tab: T) => string;   // по умолчанию само значение
  onSelect(tab: T): void;
}): JSX.Element;

// builtin/context/modal.tsx
export type ContextModalState = {
  readonly tab: Accessor<ContextTab>;
  setTab(tab: ContextTab): void;               // также закрывает полный текст
  readonly selected: Accessor<number>;
  setSelected(index: number): void;
  readonly detail: Accessor<ContextInjection | undefined>;
  setDetail(item: ContextInjection | undefined): void;
};
export function createContextModalState(tab: ContextTab): ContextModalState;
export function contextModal(state: ContextModalState, onDismiss: () => void): ModalRequest; // заменяет contextUsageModal
export function switchTabKey(event: KeyEvent, state: ContextModalState): boolean;

// builtin/context/injections-view.tsx
export function InjectionsContent(props: { context: ModuleContext; state: ContextModalState }): JSX.Element;

// src/module.ts — Module
readonly header?: boolean;

// src/pi-state.ts — PiState и mutable store
readonly contextInjections: ContextInjections | null;
```

#### Wire и команды

- `parseContextInjections` возвращает `null` на отсутствующий или невалидный JSON, `v !== 1`, `items` не массив, а также если хоть один элемент неверен: `group` не из трёх, пустой `name`, `origin` не строка, `tokens` не неотрицательный safe integer, `text` не строка, `requestOnly` есть, но не из четырёх. Пустой `items` допустим. В `parseContextUsage` неизвестный `tab` даёт `null`.
- piu `/context`: `takesArguments` остаётся `false` (выбор из списка сразу открывает Usage). `args.trim()`: `""` → `/piu-context-usage`, `"injections"` → `/piu-context-usage injections`. Любое другое значение не вызывает Pi и показывает `context.actions.showToast(\`Unknown /context view "${view}". Use /context or /context injections.\`, "error")`.
- Pi `openUsage(args)`: `tab = args.trim() === "injections" ? "injections" : "usage"`, затем `open += 1`, `publishInjections(ctx)`, `publish(ctx)`, именно в этом порядке. `view()` кладёт `tab` во все три вида.
- `publishInjections`: при `open === 0` ничего; иначе `setStatus(KEY, injections ? serializeContextInjections(injections) : undefined)` в таком же `try/catch`, как `publish`. Вызывать в `openUsage` и в `context_with_system` после захвата. В `turn_end`, `agent_settled`, `model_select` и в событиях компакции не вызывать.
- `reset` (`session_start`, `session_tree`, `session_shutdown`): `injections = undefined`, `tab = "usage"`, очистить оба ключа. Компакция и смена модели injections не трогают: последний запрос остаётся последним.
- `src/pi-state.ts`: в `setStatus` ветка `CONTEXT_INJECTIONS_STATUS_KEY` рядом с веткой `CONTEXT_USAGE_STATUS_KEY`: `setState("contextInjections", reconcile(parseContextInjections(record.statusText)))`. Значение не попадает в `statuses`.

#### Сборка списка (`collectInjections`)

Весь расчёт синхронный внутри нашего обработчика: позже другие обработчики могут менять те же объекты. В `context_with_system` вызывать для любого запроса, независимо от `modelId`: `injections = { items: collectInjections({ request: event.messages, session: ctx.sessionManager.buildSessionProjection().messages, effectivePrompt: ctx.getSystemPrompt(), hiddenTools, tools: pi.getAllTools() }) }`. Сохраняются только строки и числа, transcript не удерживается.

- `sent = getCurrentSystemMessage(convertToLlm(request))`, `saved = getCurrentSystemMessage(convertToLlm(session))`. Подмена промпта: `saved !== undefined && effectivePrompt !== getSystemMessageText(saved)`. Без `saved` подмены нет.
- **system**, подмена есть: одна строка `{ group: "system", name: "system prompt", origin: "extension", tokens: ceil(effectivePrompt.length / 4), text: effectivePrompt, requestOnly: "forced" }`, строк разделов нет.
- **system**, подмены нет: для каждой непустой (не `null`) записи `sent.sections` в порядке ключей строка `{ name, origin, tokens: ceil(text.length / 4), text }`, где `text` — значение раздела как есть, с обёрткой `<name>`. `origin` = `"Pi"`, если `name` входит в `PI_SECTIONS = ["preamble", "tools", "rules", "docs", "addendum", "project_context", "skills", "cwd"]` (`// why:` скопировано из `buildSystemPromptSections` Pi 1.5.0, `dist/core/system-prompt.js`; перечитать при обновлении Pi), иначе `"extension"`. Если `contentText(sent.content)` не пуст, перед разделами строка `name: "content"`, `origin: "extension"`.
- **tools**: `getCurrentTools(convertToLlm(request))` без имён из `hiddenTools`, в порядке объявления. `text = JSON.stringify(toToolDeclaration(tool), null, 2)`, `tokens = ceil(JSON.stringify(toToolDeclaration(tool)).length / 4)`, `origin = toolOrigin(info)` для `info` с тем же `name` из `tools`, без совпадения — `"extension"`.
- `toolOrigin`: `sourceInfo.source` `"builtin"` или `"sdk"` → `"Pi"`. `sourceInfo.origin === "package"` → `source` без хвоста `@<version>` (`npm:@chthub/pi-subagents@0.5.0` → `npm:@chthub/pi-subagents`). Иначе `basename(path, extname(path))`, а если это `index` или `pi-extension`, то `basename(dirname(path))` (`builtin/ask-user-question/pi-extension.ts` → `ask-user-question`).
- **messages**: сравнить не-system сообщения `request` и `session` по `messageKey` = `JSON.stringify([role, customType ?? "", modelFacingPart])`. Здесь `modelFacingPart` = `content` для `user`/`assistant`/`custom`; `{ toolCallId, toolName, content, isError }` для `toolResult`; `summary` для `branchSummary`/`compactionSummary`; для остальных — всё, кроме `timestamp` (`// why:` идея из `pi-context-view` 0.8.3 `capture/diff.ts`: метка времени и поля записи сессии модели не отправляются). Срезать общий префикс и общий суффикс. В середине для каждого индекса `i < max(r.length, s.length)`: оба есть и совпадают `role` и `customType` → строка запроса с `"changed"`; иначе строка запроса (если есть) с `"added"` и строка сессии (если есть) с `"removed"`. Вне середины перечисляются только `custom`-сообщения, без пометки. Порядок: сообщения запроса по порядку, затем `"removed"`.
- Строка сообщения: `name` = `customType` для `custom`, иначе `role`; `origin` = `"extension"`; `tokens = estimateTokens(message)`; `text = messageText(message)`. `messageText`: для каждого `convertToLlm([message])`: `user`/`toolResult` → `contentText(content)`; `assistant` → блоки `text` и `thinking` как есть, `toolCall` как `${name} ${JSON.stringify(arguments)}`; всё через `"\n\n"`.

#### Modal

- Panel `context`, Modules по порядку: `context.view` (`title: "Context"`, рендерит Usage или Injections по `state.tab()`), `context.tabs` (`header: true`, `minHeight: 2`, `<Tabs tabs={CONTEXT_TABS} label={…"Usage"/"Injections"} …>`), `context.hints` (`footer: true`, `minHeight: 1`). Заголовок Modal берётся из `entries[0]`, поэтому `context.view` первым. Размеры прежние: `75%` × `75%`.
- `layout.tsx`: `headers = entries.filter(e => e.placed.module.header && !e.placed.module.footer)`, `scrolled` исключает и header, и footer. Headers рисуются в `<box flexDirection="column" flexShrink={0}>` перед `<scrollbox>`.
- `Tabs` повторяет нынешнюю разметку выбора модели (два ряда, цвета, клик по имени с `preventDefault`). Длину хвостовой `─` считать от ширины собственного внешнего box, измеренной в `onSizeChange`, а не от константы: `max(0, width − (1 + Σ(label.length + 3)))`.
- `createContextModalState`: сигналы; `setTab` сначала сбрасывает `detail`. `contextModal.onDismiss(reason)`: `reason === "escape" && state.detail()` → `setDetail(undefined)`, вернуть `false`; иначе `onDismiss()`.
- Host (`index.tsx`): новый `open` без открытой Modal → `state = createContextModalState(view.tab)` и `openModal(contextModal(state, forgetClose))`. Новый `open` при открытой Modal → `state.setTab(view.tab)`. Остальная логика `lastOpen`/`forgetClose`/`null` из тикета 26 не меняется.
- `switchTabKey`: `left`/`right` переключают на другую вкладку, `preventDefault`, вернуть `true`. Вызывать первым в `onKeyDown` у `UsageContent` и `InjectionsContent`.
- Hints (`theme.faint`, текст строкой-выражением): Usage — `"←→ tabs   ↑↓ / PgUp PgDn scroll   esc close"`; список — `"←→ tabs   ↑↓ select   ⏎ open   esc close"`; полный текст — `"←→ tabs   ↑↓ / PgUp PgDn scroll   esc back"`.
- `InjectionsContent`, фокусируемый box с `focused`:
  - `context.pi.contextInjections === null` → `<text fg={theme.muted}> No request to the model yet.</text>`.
  - список: группы в порядке system, tools, messages; пустая группа пропускается. Заголовок группы — несфокусируемая строка `${label} · ${count}` цветом `faint`, где label: `System prompt` / `Tools` / `Messages`. Строка элемента: `backgroundColor` `bar`, если выбрана; ` ${name}` (`text`/`barText` жирный, `flexShrink 1`, `truncate`), `  ${origin}` (`muted`/`barMuted`, `flexShrink 0`, `maxWidth="30%"`, `truncate`), при `requestOnly` `  request only · ${change}` (`text`/`barText`), `  ${formatTokens(tokens).padStart(6)} tokens` (`text`/`barText`). Под списком пустая строка и `faint`: `"Edits made after piu's hook (later context_with_system handlers, provider payload rewrites) are not shown."`.
  - клавиши списка: `up`/`down` ±1, `pageup`/`pagedown` ±10 с ограничением диапазоном, `return` → `setDetail(items[selected])`. Мышь: `onMouseMove` выбирает строку, `onMouseDown` с `preventDefault` открывает её текст. Эффект ограничивает `selected` длиной списка; выбранная строка прокручивается в видимую область через `queueMicrotask(() => scrollIntoView(row))`.
  - полный текст (`detail` — копия элемента, новые данные её не меняют): жирное `name`; строка `muted` `${origin} · ${formatTokens(tokens)} tokens` плюс ` · request only · ${change}`; пустая строка; `text` цветом `text` с переносом по умолчанию. Клавиши: `switchTabKey`, затем `scrollKeys`.

### Steps

Seam: `startPiu` — команды `/context` и `/context injections`, клавиши и клики, кадр Modal (`modalText`, `modalBounds`). Model test: `test/context-usage.test.ts` (`fixture`, `send`, malformed status через ui tool). В новом файле свой `fixture(script, backendEnv)`, где `installedPiExtensions` — `context-usage.ts`, `extensions` + `placement.status: ["probe.capture"]`, как в model test. Строки элементов читать по группам: `name` — первое поле `line.trim().split(/\s{2,}/)`, выбор по индексу среди строк элементов (заголовки групп и пояснение не считаются).

Фикстура: `PIU_CONTEXT_SECTION=<body>` → `event.systemPromptOptions.sections.probe_notes = body`; `PIU_CONTEXT_MESSAGE=<text>` → вернуть `{ message: { customType: "probe-note", content: text, display: false } }`; `PIU_CONTEXT_FORCED=<mark>` → вернуть `{ systemPrompt: \`${event.systemPrompt}\n\n${mark}\` }`. Результаты объединить в один возвращаемый объект.

1. Test "injections before the first request say there was none": `/context injections` до хода → Modal открыт, вкладка Injections активна (кадр без `Window:`), виден текст `No request to the model yet.`. Red, then green в `src/context-usage.ts` (tab, ключ, парсер), `pi-state.ts`, `index.tsx` (аргумент), `pi-extension.ts` (`tab`, `publishInjections`), `modal.tsx`, `injections-view.tsx`, `tabs.tsx`. Check: `bun test test/context-injections.test.ts -t '^injections before the first request say there was none$' --timeout 20000`.
2. Test "a section added in before_agent_start is listed with its size": `PIU_CONTEXT_SECTION` = `"PROBE_SECTION_BODY ".repeat(20).trim()`, один ход, `/context injections` → в группе `System prompt` есть строка `probe_notes` с `extension` и `formatTokens(Math.ceil(\`<probe_notes>\n${body}\n</probe_notes>\`.length / 4))`; строка `preamble` с `Pi` есть, `request only` у разделов нет. Red, then green в `collectInjections` (system). Check: `… -t '^a section added in before_agent_start is listed with its size$'`.
3. Test "Enter opens an injection's full text and Escape returns to the list": тот же раздел; Down до `probe_notes`, Enter → виден `PROBE_SECTION_BODY` и подсказка `esc back`, строк списка нет. Esc → снова список, Modal открыт. Второй Esc → Modal закрыт, введённый маркер виден в `inputArea`. Red, then green в `InjectionsContent` и `onDismiss`. Check: `… -t "^Enter opens an injection's full text and Escape returns to the list$"`.
4. Test "a click opens an injection's full text": клик по координатам строки `probe_notes` → текст раздела виден. Red, then green в `onMouseDown` строки. Check: `… -t "^a click opens an injection's full text$"`.
5. Test "the listed tools are the tools the faux model received": ответ `"Tools: {tools}"`, после хода имена строк группы `Tools`, отсортированные и склеенные через `,`, равны тексту после `Tools: ` в чате; у каждой строки `Pi`. Red, then green в `collectInjections` (tools, `hiddenTools`, `toolOrigin`). Check: `… -t '^the listed tools are the tools the faux model received$'`.
6. Test "a message an extension adds is listed as saved": `PIU_CONTEXT_MESSAGE=PROBE_NOTE_TEXT` → в группе `Messages` строка `probe-note`, `extension`, без `request only`; в её тексте `PROBE_NOTE_TEXT`. Red, then green в части messages. Check: `… -t '^a message an extension adds is listed as saved$'`.
7. Test "a message edited only in the request is marked": `PIU_CONTEXT_TRANSIENT=1` → строка `user` с `request only · changed`, в её тексте `REQUEST_ONLY_`; другие строки без пометки. Red, then green в сравнении `messageKey`. Check: `… -t '^a message edited only in the request is marked$'`.
8. Test "a forced system prompt is marked and replaces the sections": `PIU_CONTEXT_FORCED=FORCED_PROMPT_MARK` → в `System prompt · 1` строка `system prompt` с `request only · forced`, строки `preamble` нет, в тексте `FORCED_PROMPT_MARK`. Red, then green в ветке подмены. Check: `… -t '^a forced system prompt is marked and replaces the sections$'`.
9. Test "arrow keys switch between usage and injections in one Modal": `/context` → `Window:`; Right → список Injections, `Window:` нет, `modalBounds` прежние; Left → снова `Window:`. Red, then green в `switchTabKey`. Check: `… -t '^arrow keys switch between usage and injections in one Modal$'`.
10. Test "a click on a tab switches the view": клик по `Injections` в полосе вкладок → список; клик по `Usage` → `Window:`. Red, then green в `Tabs.onSelect`. Check: `… -t '^a click on a tab switches the view$'`.
11. Test "the tab bar stays while the list scrolls": терминал 100×20, раздел из шага 2, `/context injections`; запомнить строку с `Usage` и `Injections`; Down 15 раз → строка `preamble` прокручена из вида, полоса вкладок на той же строке экрана. Red (без `header` полоса уезжает), then green в `src/module.ts` и `src/layout.tsx`. Check: `… -t '^the tab bar stays while the list scrolls$'`.
12. Test "a new session forgets the last request's injections": ход, `/context injections` показывает `preamble`; `hooks.probe.actions.newSession()` → Modal закрыт; новая `/context injections` → `No request to the model yet.`. Red, then green в `reset` и очистке `pi-state`. Check: `… -t "^a new session forgets the last request's injections$"`.
13. Test "an unknown context view shows an error and opens nothing": `/context foo` → Toast `Unknown /context view "foo"`, `modalBounds(piu)` undefined, ввод работает. Red, then green в `run` команды. Check: `… -t '^an unknown context view shows an error and opens nothing$'`.
14. Test "a malformed injections status is neither shown nor kept": ui tool `setStatus` с ключом `opentui:context/injections` и обрезанным JSON, затем ответ-маркер → wire-текста в кадре нет, Modal нет; `/context injections` показывает настоящий список (`preamble`). Red, then green в парсере и маршрутизации. Check: `… -t '^a malformed injections status is neither shown nor kept$'`.
15. Выбор модели на `Tabs`, без нового теста: удалить inline-вкладки и осиротевшие константы. Check: `bun test test/swiss-modals.test.ts test/modal.test.ts test/theme.test.ts --timeout 20000` зелёные, вид вкладок выбора модели прежний.
16. Ticket 26 не регрессировал: `bun test test/context-usage.test.ts --timeout 20000`. Если полоса вкладок сдвинула координаты кадров, поправить расположение в тесте, не ослабляя проверки.
17. Docs и трекер: пункт в `docs/agents/pi-extensions.md`: «**piu's own Pi extensions load before installed ones.** The app passes them with `-e`, and Pi puts CLI paths first (`mergePaths` in `dist/core/resource-loader.js`), so in chained hooks (`context`, `context_with_system`, `before_provider_request`) ours run first and never see what an installed package changes in the same hook. `/context injections` therefore shows `context` edits and forced prompts, but not later `context_with_system` or payload rewrites.» Правка пункта в `docs/agents/opentui.md` и комментарий `From 27:` в тикете 32. Check: `git diff --stat` показывает три файла.
18. Check: `pnpm typecheck` и `pnpm exec biome check src/context-usage.ts builtin/context/injections.ts builtin/context/pi-extension.ts builtin/context/index.tsx builtin/context/modal.tsx builtin/context/injections-view.tsx src/tabs.tsx builtin/model/index.tsx src/module.ts src/layout.tsx src/pi-state.ts test/fixtures/pi-extensions/context-usage.ts test/context-injections.test.ts test/context-usage.test.ts`.
19. Устойчивость: `test/context-injections.test.ts` 10 раз подряд с `--timeout 20000`, остановка на первом падении; затем `bun test test/context-usage.test.ts test/btw.test.ts test/autocomplete.test.ts test/extension-ui.test.ts test/modal.test.ts test/swiss-modals.test.ts test/layout.test.ts --timeout 20000`; затем отдельно `pnpm check` (tool timeout 600000). Не запускать dev/build.

### Commands

- Typecheck: `pnpm typecheck`
- One test file: `bun test test/context-injections.test.ts --timeout 20000` (фильтр вывода из `docs/agents/testing.md`)
- Full suite: `pnpm check` (отдельно, tool timeout 600000)
- Model test, проверен на базе: `bun test test/context-usage.test.ts -t '^context includes request-only messages absent from the saved session$' --timeout 20000` — 1 pass, 0 fail.
- Pi-Bolt, вручную пользователем вне sandbox после первого работающего Pi-side среза: `PIU_COMPAT_ARGS="-e $PWD/builtin/context/pi-extension.ts" bun scripts/pi-bolt-compat/run.ts`, затем `/context injections` в настоящем piu до и после хода. Пока результата нет, в тикете это отмечено как непроверенное.

### Pitfalls

- Подмена определяется равенством `ctx.getSystemPrompt()` и `getSystemMessageText(saved)`. Шаг 2 сторожит обратное: без подмены строки «forced» быть не должно. Если шаг 2 краснеет из-за ложной подмены (например, порядок ключей разделов в replay отличается от `buildSystemPrompt`), это ошибочное допущение плана: остановиться и сообщить, не подбирать нормализацию.
- Все чтения (`buildSessionProjection`, `getSystemPrompt`, `convertToLlm(event.messages)`) выполнять синхронно в обработчике и ничего не возвращать: последующие обработчики меняют те же объекты, а возврат `messages` изменил бы запрос.
- Скрытые tools Pi убирает только после `context_with_system` (`_installHiddenDeclarationsProjection`), поэтому фильтр `hiddenTools` обязателен, иначе шаг 5 разойдётся с `{tools}` faux model.
- Не добавлять сравнение разделов и tools «только в запросе» и не переносить захват в обёртку провайдера: это решения, отклонённые выше.
- `<For>` вызывает функцию элемента без отслеживания: «выбрана» передавать геттером. Выбор мышью — `onMouseMove`, не `onMouseOver`. `onMouseDown`, который открывает текст или переключает вкладку, вызывает `preventDefault`. Строки с пробелами — строковыми выражениями (`docs/agents/opentui.md`).
- Esc ловит глобальный `useKeyboard` в `ModalLayer` раньше фокусированного элемента, поэтому возврат к списку делается только через `onDismiss` → `false`, не в `onKeyDown`.
- `Tabs` до первого `onSizeChange` рисует хвост нулевой длины; в тестах ждать кадр с нужным содержимым. Тест выбора модели в `swiss-modals` проверяет `glyphs.rule.repeat(5)` под вкладками — это обеспечивают разрывы между вкладками, а не хвост.
- Строки списка рисуются на `bar` поверх Panel: в тестах проверять строку целиком или через разбор полей, а не `includes` по всему Modal. Перед `not.toContain` дождаться кадра, где данные Backend уже пришли (`docs/agents/testing.md`).
- Builtin Extension импортируется из пути репозитория и общий для всех тестов файла: состояние Modal создаётся на каждое открытие в host, не на уровне модуля.
- В Pi 1.5.0 extension hook `message_end` срабатывает до сохранения сообщения; injections берутся из `context_with_system`, где проекция сессии уже содержит prompt и patch системы, поэтому новые обработчики `message_end` не нужны.

## Comments

- **Шаг 5, происхождение tools.** План требует `Pi` у каждой строки, но его же правило `toolOrigin` даёт `ask-user-question` для `ask_user` из `builtin/ask-user-question/pi-extension.ts`: piu передаёт свои Pi extensions через `-e`, у них `sourceInfo.source` = `local`, поэтому ветка пути называет инструмент по папке. Тест проверяет, что origin у всех строк непустой, `read`/`bash` — `Pi`, `ask_user` — `ask-user-question`; последнее — ровно пример из правила плана.
- **`test/context-usage.test.ts`, проверка колеса.** 6 → 8 шагов колеса: полоса вкладок забрала две строки у scrollbox. Проверка та же — низ Modal (`unassigned overhead`) появляется, чат не сдвинулся.
- **Шаг 12, мутация reset.** Снятие `injections = undefined` не краснит тест: `/new` перезагружает Pi extension, и новый экземпляр пуст сам; тест проверяет видимый результат, а не путь (как в 26). Очистка в `reset` оставлена по плану.
- **Шаги 8–10, 13–14 зелёные с первого прогона** (захват, парсер, переключение вкладок и тост пришли с шагами 1–2). Мутации: `forced = false` краснит шаг 8; без `switchTabKey` — шаг 9; без `onSelect` у `Tabs` — шаг 10; без `header: true` — шаг 11; без ветки `CONTEXT_INJECTIONS_STATUS_KEY` в `pi-state` — шаг 14; без отказа в `run` — шаг 13. Шаг 7 краснит `messageKey` без содержимого.
- **Ревью Standards, исправлено:** `publish`/`publishInjections`/очистка сведены к одному `trySetStatus(ctx, key, () => …)` с одним `try/catch` (thunk — потому что `view(ctx)` сам бросает на устаревшем ctx); в тесте неизвестного вида второй `waitForFrame` ждёт и Toast, и ввод, чтобы не гоняться с 3-секундным таймаутом; повторный `tabRow` вынесен, `selectedName` читает `modalContentInsets`.
- **Ревью Standards, не менял:** `header` и `footer` как два флага допускают оба сразу; `layout.tsx` трактует это как footer. Это согласованная сигнатура плана (`header?: boolean`) и ссылка из тикета 32, переделка в `pin` — отдельное решение.
- **Второе ревью.** Подписи `extension` в Modal заменены на `Pi extension` (по GLOSSARY «extension» без уточнения — Extension этого проекта); группы и виды изменений запроса собраны в `CONTEXT_INJECTION_GROUPS` и `REQUEST_ONLY_CHANGES`, из которых выводятся типы; парсер использует type guards вместо `as`; `Math.ceil(chars / 4)` вынесен в `charsToTokens` и применён также в `usage.ts`; `ContextModalState` и `switchTabKey` перенесены в `builtin/context/state.ts`, цикл `modal.tsx ↔ injections-view.tsx` убран; в `GLOSSARY.md` добавлен Header.
- **Тикет 32, содержимое коммита.** В коммит попали правки плана в тикете 32, которые лежали в рабочем дереве до начала работы; коммит пересобран — в нём только комментарий `From 27:`, а сами правки плана остались незакоммиченными, как и были.
- **Проверки:** `test/context-injections.test.ts` — 14 pass, 20 прогонов подряд без падений (5 последних — после второго ревью); `test/context-usage.test.ts` + btw/autocomplete/extension-ui/modal/swiss-modals/layout — 169 pass после правок второго ревью; `pnpm typecheck` и Biome чисто. Полный `pnpm check` — 4 падения, которые воспроизводятся на чистом worktree `213b980`: два `/tree` (`test/session.test.ts`) и два scroll-теста (`test/chat.test.ts`); к диффу не относятся.
- **Pi-Bolt не проверен:** `PIU_COMPAT_ARGS="-e $PWD/builtin/context/pi-extension.ts" bun scripts/pi-bolt-compat/run.ts` в sandbox падает с `EACCES` на `~/.pi/agent/trust.json.lock`; ручная проверка `/context injections` в настоящем piu до и после хода — за пользователем.
