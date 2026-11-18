# 33: Действия Extensions, несколько сочетаний и последовательности в keybindings

**What to build:** Любое действие, на которое можно нажать клавишу, настраивается в Config: и встроенные действия piu, и действия, которые объявляет Extension. Extension объявляет действие сама, с описанием и сочетанием по умолчанию: например, Extension `modes` (тикет 24) объявляет «следующий режим» на Alt+M. У действия может быть несколько сочетаний, а сочетание может быть последовательностью нажатий вроде `ctrl+x m`. Если два действия претендуют на одно сочетание, побеждает более позднее назначение. Это основа для вкладки «Hotkeys» в Settings (тикет 34).

**Blocked by:** None (can start immediately).

**Status:** done

## Решения

- **Действие Extension** объявляется в новом необязательном поле `Extension` (рядом с `commands`): имя, описание, сочетания по умолчанию и обработчик. Обработчик не обязан быть командой. Полное имя действия — `<extension>.<имя>`. Команды по-прежнему доступны как `command.<name>`, без своих сочетаний по умолчанию.
- **Значение в Config** — строка или массив строк: `"command.model": ["ctrl+l", "ctrl+x m"]`. Строка — одно сочетание. Пробел разделяет нажатия последовательности, каждое из них разбирается по нынешним правилам одиночного сочетания. `[]` снимает с действия все сочетания, в том числе сочетания по умолчанию. Массив заменяет сочетания по умолчанию целиком, а не добавляется к ним: так массивы в Config работают везде.
- **Последовательность — не длиннее двух нажатий**, этого хватает для `ctrl+x m`. Три и больше — ошибка запуска.
- **Порядок назначений** от раннего к позднему: умолчания piu, затем умолчания Extensions в порядке их загрузки, затем личный Config в порядке ключей. Позднее назначение того же сочетания побеждает: у проигравшего действия это сочетание не срабатывает, остальные его сочетания работают. Конфликт — не ошибка запуска. То же правило действует, когда одиночное сочетание совпадает с первым нажатием последовательности: срабатывает только назначенное позже.
- **Конфликты вычисляются в одном месте** и доступны вкладке «Hotkeys» (тикет 34): какое действие какое сочетание потеряло и кому.
- **Ссылки на действие Extension, которая не загружена** (ни один её Module не стоит в Placement), не ошибка: так же сейчас ведут себя сочетания по умолчанию. Неизвестное действие остаётся ошибкой запуска с путём `keybindings.<action>`.
- **Shift+Enter — неизменяемое сочетание новой строки** в поле ввода (его даёт сам `textarea`). Его нельзя снять, а `shift+return` нельзя назначить никакому действию, кроме `input.newline`, ни отдельно, ни как нажатие последовательности: в Config это ошибка запуска с путём `keybindings.<action>`, во вкладке Hotkeys (тикет 34) назначение не сохраняется и показывает ошибку. `input.newline` задаёт дополнительные сочетания (по умолчанию `ctrl+j` для терминалов без kitty), `[]` снимает только их.
- **Подсказка новой строки под полем ввода** (тикет 40, `newlineKey()` в `builtin/input/index.tsx`): при умолчании и при `[]` `⇧⏎`, при переназначенном `input.newline` его первое сочетание. `formatChord` (`src/keybindings.ts`) учится печатать последовательность из двух нажатий через пробел; ей же пользуется вкладка Hotkeys.
- **Клавиши внутри Modules** (стрелки в списках, Esc, Enter, `f` в выборе модели, клавиши input кроме `input.newline`) в этот тикет не входят. Pi'шный `keybindings.json` piu не трогает.

## Критерии приёмки

- [x] Extension объявляет действие с сочетанием по умолчанию; нажатие запускает его обработчик, если Extension загружена. Действие можно переназначить и снять в Config.
- [x] Значение keybinding — строка или массив строк; каждая строка — одно сочетание или последовательность из двух. Неверная запись (неизвестная клавиша, три нажатия, пустая строка) — ошибка запуска с путём `keybindings.<action>`, как сейчас.
- [x] Любое из нескольких сочетаний действия запускает его.
- [x] После первого нажатия последовательности piu ждёт второе не дольше 1 секунды. Совпавшее второе нажатие выполняет действие и не попадает в input.
- [x] Esc во время ожидания отменяет последовательность и больше ничего не делает.
- [x] Несовпавшее второе нажатие или истёкшее ожидание отдают оба нажатия дальше по обычному пути, как если бы последовательности не было: текст и другие сочетания работают как раньше.
- [x] Две последовательности с общим первым нажатием (`ctrl+x m` и `ctrl+x t`) работают обе.
- [x] Два действия на одном сочетании: срабатывает назначенное позже по порядку из «Решений», без ошибки запуска.
- [x] `shift+return` в сочетаниях любого действия, кроме `input.newline`, в том числе в последовательности, — ошибка запуска с путём `keybindings.<action>`. Shift+Enter переводит строку при любом `input.newline`, включая `[]`.
- [x] Подсказка новой строки под полем ввода показывает первое сочетание `input.newline`, при умолчании и при `[]` `⇧⏎`; последовательность показывается двумя нажатиями.
- [x] Значения по умолчанию в репозитории не меняются.
- [x] `docs/extensions.md` описывает, как Extension объявляет действие; `GLOSSARY.md` получает термины для действия и его сочетаний.

### Проверки

- [x] Проверка через `startPiu` с личной Extension, которая объявляет действие на `alt+m`: нажатие вызывает действие; переназначение в личном Config на другую клавишу — старая больше не вызывает, новая вызывает.
- [x] Проверка: `"command.model": "ctrl+x m"` — Ctrl+X, затем M открывает выбор модели, а input не изменился.
- [x] Проверка: Ctrl+X, затем буква не из последовательности — обе клавиши обработаны как обычно.
- [x] Проверка: Ctrl+X и Esc — ничего не открылось, input не изменился.
- [x] Проверка: два действия на одном сочетании — срабатывает позднее, а конфликт виден в данных о конфликтах.
- [x] Проверки разбора Config: строка, массив, `[]`, последовательность из двух, из трёх, неверная часть, неизвестное действие, `shift+return` у другого действия отдельно и в последовательности.
- [x] Проверка: `"input.newline": ["ctrl+x n", "alt+n"]` — подсказка показывает первое; `"input.newline": []` — подсказка `⇧⏎`, Shift+Enter переводит строку.
- [x] Существующие проверки keybindings продолжают проходить.

## Notes

- Сейчас `Keybindings` — это одно `Chord` на действие (`src/keybindings.ts`), а `builtin/input` сам читает `input.newline` и показывает его в подсказке под полем (тикет 40). Новый формат меняет оба места.
- Никто не проверял, что input сейчас делает с Ctrl+X (например, вырезание). Решить в плане, кто получает первое нажатие последовательности первым.
- Пока открыт Modal, глобальные сочетания не срабатывают (`src/app.tsx`). Так и оставить.
- Взято из закрытого тикета 23 (`.scratch/closed/features/23-two-stroke-keybindings.md`): правила ожидания второго нажатия и Pi extension `selector-chords`, который этот тикет заменяет.

## После приёмки (вручную)

- [ ] Добавить `"command.model": "ctrl+x m"` и `"command.reasoning": "ctrl+x t"` в личный Config (`~/.piu/config.json`), при желании массивом вместе с нынешними клавишами.
- [ ] Удалить `selector-chords.ts` из agent dir и его строку `-extensions/selector-chords.ts` из Pi settings.

## Ticket plan

Base: `de806e8` on `main`, planned 2026-11-18.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat de806e8 HEAD -- src/keybindings.ts src/keybinding-router.ts src/config.ts src/module.ts src/extensions.ts src/app.tsx src/layout.tsx builtin/input/index.tsx test/config.test.ts test/chat.test.ts test/keybindings.test.ts test/hotkeys.test.ts test/fixtures/hotkeys-extensions/hotkeys-a/index.tsx test/fixtures/hotkeys-extensions/hotkeys-b/index.tsx test/fixtures/hotkeys-extensions/invalid-action/index.tsx docs/extensions.md GLOSSARY.md`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

Разделить разбор личного Config, разрешение конфликтов и доставку клавиш. Один чистый реестр возвращает описания действий, назначенные и действующие сочетания и пары «проигравшее → победившее»; только действующие сочетания читают маршрутизатор и подсказки. Маршрутизатор задерживает первое нажатие до распознавания пары и возвращает несработавшие нажатия через штатный `renderer.keyInput`; обработчики команд, Modals и поля ввода не имитируются.
Rejected: `@opentui/keymap`: таймаут документированно сбрасывает ожидание, а не возвращает задержанное нажатие; всё равно понадобились бы повторная доставка и отдельное согласование конфликтов с данными Hotkeys.

### Reuse

- `parseChord`, `isKeyName`, `matches`, `commandAction` (`src/keybindings.ts`): сохранить правила одиночного нажатия и сопоставление Ctrl+J / `linefeed`.
- `loadExtension` / `collectCommands` (`src/extensions.ts`): получать объявления только при обходе Placement, как `commands` и `settingsTabs`; копировать валидацию границы из `loadExtension`.
- `CommandContext`, `BoundCommand.run()` и `lifecycleCommands`: Extension получает тот же контекст, что команда; `command.<name>` запускается без аргументов.
- `focus.held()`, `focus.move`, `focus.jumpChat`, `focus.returnToInput` (`src/focus.ts`), `modals.stack()` (`src/modal.tsx`): не переписывать логику фокуса и Modal.
- `createToasts` (`src/toast.tsx`): брать таймер из `renderer.clock`, чистить при размонтировании.
- `startPiu`, `inputArea`, `inputHints`, `modalBounds` (`test/harness.ts`), `expectNewline` (`test/keyboard.test.ts`), `hooks.loaded` (`test/hooks.ts`): копировать проверки реального ввода, отправки и ленивой загрузки; хранилище теста — только временный `PIU_HOME`.

### Changes

- `src/keybindings.ts` (edit): оставить `Chord`; заменить значение `Keybindings` списком одно- или двухтактных сочетаний. `parseChord` после обычного разбора канонизирует `linefeed` в `ctrl+j` (остальные модификаторы сохраняются); `matches` использует ту же эквивалентность для события. `sameShortcut` сравнивает канонические нажатия по полям, не по тексту для показа; `formatChord` форматирует tuple через пробел с прежними подписями нажатий.
- `src/config.ts` (edit): `Config.keybindings` — только личный слой, парсить `user.keybindings === undefined ? {} : user.keybindings`, без `mergeObjects`. Сохранить пять существующих строк в `defaultConfig.keybindings`, добавить `chat.top: "ctrl+home"` и `chat.bottom: "ctrl+end"` взамен хардкода. `parseBindingValue` принимает строку или массив, обрезает внешние пробелы в каждой строке, разделяет нажатия одним или несколькими ASCII-пробелами. `[]` — пустой список, а `""`, пробельная строка, неверное нажатие, нестроковый элемент и длина больше двух — `fieldError(path, ...)`. `shiftEnter` разрешён только для `input.newline`: отдельно и вторым нажатием; первым в паре — согласованная ошибка (иначе неизменяемый Shift+Enter пришлось бы задерживать). Не менять общий merge Config.
- `src/module.ts` (edit): добавить `Extension.keybindingActions`; `ModuleContext.keybindings` становится accessor результата реестра. `registerFocusedAction` регистрирует обработчик на время жизни Module; он доступен только при фокусе на его целевом Renderable. Контракт `CommandContext` не меняется.
- `src/extensions.ts` (edit): `resolvePlacement` перестаёт проверять `config.keybindings`; возвращает включённые имена, действия и команды с именем владельца. `collectCommands` сохраняет проверку уникальности. `collectKeybindingActions` сохраняет порядок первого появления Extensions в Placement и порядок внутри `keybindingActions`; проверяет массив, непустое локальное имя без точки/пробела, непустое описание, массив строк умолчаний и функцию `run`. `command` — зарезервированное пространство имён для действий команд. Повтор полного id и неверное объявление дают `StartupError` с Extension и полем; умолчания проходят через `parseBindingValue` с путём вида `Extension "hotkeys-a".keybindingActions[0].defaultBindings`.
- `src/app.tsx` (edit): `prepareKeybindings` строит каталог: `focus.next`, `focus.previous`, `input.newline`, `chat.top`, `chat.bottom` с описаниями; затем все команды piu и загруженных Extensions с их описанием (либо `"/" + name`) и источником-владельцем; затем объявления Extension в порядке загрузки. Умолчания из `defaultConfig.keybindings` относятся к первому слою, даже для `command.model` / `command.reasoning`; остальные команды имеют `[]`. Если одного из этих двух действий нет из-за Placement, ключ признаётся известным, но не участвует в разрешении. Незнакомый `<extension>.<name>` пропустить только если папка найдена, Extension не включена и префикс не `command`; не импортировать её ради проверки. Неизвестный id при включённой Extension или отсутствующей папке — `fieldError("keybindings." + id, ...)`. Проверку дубликатов команд с `lifecycleCommands` в `createApp` сохранить; коллизии полных id действий с каталогом считать ошибкой объявления. Готовый результат передать в `App`, дать роутеру и Modules один accessor `() => props.keybindings`; запись и реактивные изменения Config — тикет 34.
- `src/keybinding-router.ts` (new): `createKeybindingRouter` хранит максимум один ожидающий префикс с первым `KeyEvent`, списком кандидатов, дедлайном и таймером; состояние и переходы ниже. Никакого Solid, backend или редактирования поля в маршрутизаторе.
- `src/app.tsx` (edit, доставка): оставить `useKeyboard`, передав ему `router.onKey`; для `run` создать таблицу команд и действий по полному id. Для `focus.next` / `focus.previous` использовать `focus.move` только когда `!focus.held()`, проверять это условие и в `canUseSequence`. `chat.top` / `chat.bottom` возвращают результат `focus.jumpChat(false / true)`. Команда или Extension запускает готовый обработчик и возвращает `true`; `false` означает обычную обработку. `registerFocusedAction` добавляет отдельную запись `{ id, target, run }` в локальный `Set` и возвращает удаление этой записи; искать первую запись с нужным id и target, равным непустому и не уничтоженному `renderer.currentFocusedRenderable`. Для одиночного `input.newline`, если target не найден, сначала дать `focus.returnToInput(event, false)` шанс перенаправить печатную клавишу, затем поискать ещё раз. Для пары проверять наличие сфокусированного target до захвата и при втором нажатии, без перевода фокуса. Одиночный `shiftEnter` не потреблять — его обрабатывает textarea. `fallback` — существующий вызов `focus.returnToInput` с тем же условием для Esc. Снять ожидание через `createEffect` при появлении Modal и в `onCleanup`; `Ctrl+C` остаётся аварийным выходом OpenTUI вне реестра.
- `builtin/input/index.tsx` (edit): `Prompt` через `context.onCleanup` снимает `registerFocusedAction("input.newline", () => field, ...)`, callback вызывает `field?.newLine()`. В `onKeyDown` убрать локальный поиск назначения, сохранить `preventDefault` на `linefeed`, если оно дошло до поля, и оставить нативный `keyBindings` для Shift+Enter. `newlineKey()` показывает первое действующее сочетание из accessor; при отсутствии или списке, равном умолчанию `[ctrl+j]`, показывает `⇧⏎`. Если первый пункт проиграл конфликт, показывать первое из оставшихся.
- `src/layout.tsx` (edit): `SlotView` берёт первое действующее `chat.bottom` для подписи существующего индикатора. При стандартном `ctrl+end` оставить текст `CTRL+End: jump to bottom`, при другом — `${formatChord(shortcut)}: jump to bottom`, при `[]` либо проигрыше всех — `jump to bottom` без клавиши. Механику скролла и Modals не менять.
- `test/config.test.ts` (edit), `test/chat.test.ts` (edit), `test/keybindings.test.ts` (new), `test/hotkeys.test.ts` (new): проверки по шагам ниже.
- `test/fixtures/hotkeys-extensions/{hotkeys-a,hotkeys-b,invalid-action}/index.tsx` (new, три файла): у `hotkeys-a` и `hotkeys-b` Module `badge` со счётчиком (`A action: 0`, `B action: 0`), действие `cycle` с `defaultBindings: ["alt+m"]`, `run` увеличивает свой счётчик. `hotkeys-a` при импорте делает `globalThis.piuTestHooks.loaded.push("hotkeys-a")`. У `invalid-action` есть Module `badge`, а `keybindingActions: [null]` намеренно без `satisfies Extension`. Импорт из `src/module.ts` только типовой.
- `docs/extensions.md` (edit): пример `keybindingActions` с `name`, `description`, `defaultBindings`, `run(context)`; имя в Config, загрузка через Placement, замена/снятие, длина пары, приоритет и исключение Shift+Enter. `GLOSSARY.md` (edit): термины **Keybinding action**, **Shortcut**, **Stroke**; действие — то, что выполняется, сочетание — одно или два нажатия, нажатие — клавиша с её модификаторами.

```ts
// src/keybindings.ts — new unless marked edit
export type Shortcut = readonly [Chord] | readonly [Chord, Chord];
export type Keybindings = Readonly<Record<string, readonly Shortcut[]>>; // edit
export type KeybindingSource =
	| { readonly kind: "piu" }
	| { readonly kind: "extension"; readonly name: string };
export type KeybindingAction = {
	readonly id: string;
	readonly description: string;
	readonly source: KeybindingSource;
	readonly defaults: readonly Shortcut[];
};
export type KeybindingAssignment = { readonly action: string; readonly shortcut: Shortcut };
export type KeybindingConflict = {
	readonly loser: KeybindingAssignment;
	readonly winner: KeybindingAssignment;
};
export type ResolvedKeybindings = {
	readonly actions: readonly KeybindingAction[];
	readonly requested: Keybindings;
	readonly effective: Keybindings;
	readonly conflicts: readonly KeybindingConflict[];
	readonly overridden: ReadonlySet<string>;
};
export const shiftEnter: Chord; // moved from builtin/input/index.tsx
export function sameShortcut(a: Shortcut, b: Shortcut): boolean;
export function formatChord(shortcut: Shortcut): string; // edit
export function resolveKeybindings(actions: readonly KeybindingAction[], overrides: Keybindings): ResolvedKeybindings;

// src/config.ts — loadConfig(path: string): Config stays
export function parseBindingValue(value: unknown, action: string, path?: string): readonly Shortcut[];
export function parseKeybindings(value: unknown): Keybindings; // existing, now exported

// src/module.ts
export type ExtensionKeybindingAction = {
	readonly name: string;
	readonly description: string;
	readonly defaultBindings: readonly string[];
	run(context: CommandContext): void;
};
// Add to Extension:
// readonly keybindingActions?: readonly ExtensionKeybindingAction[];
// In ModuleContext:
// readonly keybindings: Accessor<ResolvedKeybindings>;
// registerFocusedAction(id: string, target: () => Renderable | undefined, run: () => void): () => void;

// src/extensions.ts
type OwnedCommand = { readonly command: Command; readonly extension: string };
export type LoadedKeybindingAction = KeybindingAction & { run(context: CommandContext): void };
export type ResolvedPlacement = {
	panels: Map<string, PlacedModule[]>;
	commands: OwnedCommand[];
	settingsTabs: SettingsTab[];
	channelTitles: string[];
	piExtensions: string[];
	keybindingActions: LoadedKeybindingAction[];
	enabledExtensions: ReadonlySet<string>;
};
export function resolvePlacement(config: Pick<Config, "placement" | "modules">, folders: ExtensionFolders): Promise<ResolvedPlacement>; // edit, still async
function collectCommands(extensions: ReadonlyMap<string, Extension>): OwnedCommand[]; // edit
function collectKeybindingActions(extensions: ReadonlyMap<string, Extension>): LoadedKeybindingAction[];

// src/app.tsx — createApp signature unchanged; add App props keybindings: ResolvedKeybindings and keybindingActions: readonly LoadedKeybindingAction[]
function prepareKeybindings(config: Config, placement: ResolvedPlacement, folders: ExtensionFolders): ResolvedKeybindings;

// src/keybinding-router.ts (new)
export const sequenceTimeoutMs = 1_000;
export function createKeybindingRouter(options: {
	clock: Clock;
	bindings: () => Keybindings;
	enabled: () => boolean;
	canUseSequence: (action: string) => boolean;
	run: (action: string, shortcut: Shortcut, event: KeyEvent) => boolean;
	fallback: (event: KeyEvent) => void;
	replay: (event: KeyEvent) => void;
}): { onKey(event: KeyEvent): void; cancel(): void };
```

**Реестр.** `requested[id] = overrides[id] ?? defaults`, включая `[]`. Отсутствующие в каталоге id не попадают в результат. Сначала собрать не заменённые умолчания piu в порядке `defaultConfig.keybindings`, потом не заменённые умолчания Extensions в порядке загрузки, затем личные назначения через `Object.entries(overrides)`; порядок внутри списка не менять. Для этого `prepareKeybindings` ставит определения с умолчаниями piu в начало каталога в порядке ключей `defaultConfig.keybindings`, а определения без умолчаний не влияют на порядок назначения. Обходить назначения с конца: принять, если ни одно уже принятое не совпадает целиком и не образует пару «одиночное / префикс»; при нескольких победителях указать наиболее поздний. Одинаковое сочетание дважды у того же действия активировать один раз без конфликта; одиночное и его префиксная пара конфликтуют даже у одного действия. У последовательностей с одинаковым первым, но разным вторым конфликтов нет. Сформировать `effective` в исходном порядке сочетаний, не в порядке обхода. Пример: `A: x m`, затем `B: x`, затем `C: x t` → работают `A` и `C`, единственный проигравший `B → C`.

**Доставка.** `enabled` означает пустой `modals.stack()`. Если ожидания нет, совпавшее действующее одиночное сочетание запускается через `run`; совпавший префикс с доступным кандидатом захватывается до следующего обработчика, дедлайн `clock.now() + sequenceTimeoutMs`. Для захваченных событий вызвать и `preventDefault()`, и `stopPropagation()`. Пока ждём, немодифицированный Esc первым делом очищает ожидание и поглощается; совпавшая доступная пара очищает ожидание и запускается; промах (в том числе `run` вернул `false`) очищает ожидание, поглощает исходное второе событие и повторяет первое и второе по порядку. Таймаут возвращает только первое; когда следующее событие пришло на дедлайне или позже, выпуск первого предшествует нормальной обработке нового события. При выключении (Modal) и уничтожении отменять без повтора. Повтор — `renderer.keyInput.processParsedKey(event)` с синхронным флагом повтора в `try/finally`: на повторе пройти одиночные сочетания и `fallback`, но не захватывать префикс; остальные слушатели и сфокусированный Renderable получают свежий `KeyEvent` штатно. Если первое повторённое нажатие само открыло Modal, второе идёт уже обычным путём Modal.

### Steps

Seam: `startPiu` (`test/harness.ts`), личный Config и Extension, реальные клавиши через `mockInput`; для данных Hotkeys — `resolveKeybindings` как интерфейс потребителя. Model test: `test/keyboard.test.ts`.

Каждый тестовый шаг — red → green. Команду группы запускать после каждого шага, при необходимости с `-t` по названию. После отрицательного нажатия отрисовать новый кадр перед проверкой.

**Объявление и Config.** Check 1–4, 14–17: `bun test test/hotkeys.test.ts`. Check 5–13: `bun test test/config.test.ts` (добавить отдельные строки в существующую таблицу ошибок, сохранив случай `focus.sideways`).

1. «Extension action works without a command»: разместить `hotkeys-a.badge`, Alt+M меняет `A action: 0` → `1`.
2. «personal scalar replaces the Extension default»: `hotkeys-a.cycle: "alt+n"`, Alt+M оставляет `0`, Alt+N даёт `1`.
3. «each shortcut in the array runs the action»: `["alt+n", "alt+p"]`, каждое увеличивает счётчик, Alt+M не увеличивает.
4. «empty array removes the Extension default»: `[]`, Alt+M не увеличивает счётчик.
5. «an empty shortcut»: `command.model: ""` → ошибка `keybindings.command.model`.
6. «a whitespace-only shortcut»: `command.model: "   "` → тот же путь.
7. «a three-stroke shortcut»: `command.model: "ctrl+x m t"` → тот же путь.
8. «an invalid second stroke»: `command.model: "ctrl+x foobar"` → тот же путь.
9. «a non-string list item»: `command.model: ["x", 42]` → тот же путь.
10. «Shift+Enter bound to another action»: `command.model: "shift+return"` → тот же путь.
11. «Shift+Enter finishing another action»: `command.model: "x shift+return"` → тот же путь.
12. «Shift+Enter starting another action»: `command.model: "shift+return x"` → тот же путь.
13. «Shift+Enter starting a newline sequence»: `input.newline: "shift+return x"` → ошибка `keybindings.input.newline`.
14. «an unknown action in a loaded Extension is rejected»: разместить A, `hotkeys-a.cycl: "alt+m"` → ошибка с `keybindings.hotkeys-a.cycl`.
15. «an action in a missing Extension is rejected»: `missing.cycle: "alt+m"` → ошибка с `keybindings.missing.cycle`.
16. «an unplaced Extension is not loaded for its hotkey»: без Placement назначить `command.model`, затем `hotkeys-a.cycle` на Alt+M; число `hotkeys-a` в `hooks.loaded` не меняется, Alt+M открывает модель.
17. «a malformed action export names its Extension»: при размещении `invalid-action.badge` запуск отвергается с именем Extension и `keybindingActions`.

**Конфликты.** Check 18–23: `bun test test/keybindings.test.ts` (вызывать `resolveKeybindings`, готовить вход парсером). Check 24–25: `bun test test/hotkeys.test.ts`.

18. «later layers replace conflicting shortcuts only»: у piu `x,y`, у Extension (следующее определение) `x,z`, у третьего действия личное `z`; проверить `requested`, `effective`, `overridden` и конфликты `piu:x → Extension:x`, `Extension:z → personal:z`, сохранив `piu:y`.
19. «personal key order decides the winner»: два личных ключа на одно сочетание, перестановка ключей меняет победителя.
20. «Alt and Meta spell the same shortcut»: `ALT+m` и `meta+m` конфликтуют.
21. «a later single beats an earlier sequence»: сначала `x m`, потом `x`; действует `x`, в конфликте проиграла пара.
22. «a later sequence beats an earlier single»: сначала `x`, потом `x m`; действует пара, проиграло одиночное.
23. «an inactive single does not block another sequence»: `x m`, затем `x`, затем `x t`; работают обе пары и единственный конфликт `x → x t`.
24. «Extension defaults follow Placement load order»: `["hotkeys-b.badge", "hotkeys-a.badge"]`, Alt+M увеличивает только A.
25. «personal order beats Extension order at dispatch»: тот же Placement, личный Config назначает Alt+M сначала A, затем B; Alt+M увеличивает только B.

**Доставка.** Check 26–37: `bun test test/hotkeys.test.ts`. В тестах с `command.model` перед нажатием дождаться `faux-1`, открытие ждать по `faux-2`.

26. «Ctrl+X M opens the model picker without touching the prompt»: `command.model: "ctrl+x m"`, ввести `keep`; Ctrl+X не открывает выбор, M открывает, после Esc в `inputArea(frame).trim()` ровно `keep`.
27. «shared prefix can also open reasoning»: добавить `command.reasoning: "ctrl+x t"`; Ctrl+X M открывает модели, после закрытия Ctrl+X T открывает выбор уровня (строка `/^\s+off\s+$/`, как в `test/bottom-line.test.ts`).
28. «Ctrl+X and an unmatched letter follow the normal path»: Ctrl+X Z оставляет в prompt только `z`, Modal не открыт.
29. «miss returns the editing stroke before the letter»: `command.model: "ctrl+k m"`, текст `abc`, Home, Ctrl+K Q даёт `q`, не `qabc` или `abcq`.
30. «the unmatched second stroke still runs a single shortcut»: `command.reasoning: "g m"` и стандартный Ctrl+L у модели; G Ctrl+L открывает выбор модели и оставляет `g` в поле после закрытия.
31. «timeout replays the prefix once»: `command.model: "g m"`, `ManualClock`; после G и `advance(999)` поле пусто; `advance(1)` доставляет `g` ровно один раз; последующее M даёт `gm`, Modal не открыт.
32. «escape cancels without replay or running its own action»: `command.settings: "escape"`, `command.model: "ctrl+x m"`, `clock: new ManualClock()`; Ctrl+X Esc ничего не открывает, `clock.advance(1000)` ничего не доставляет, обычная клавиша затем работает. Нажать Esc без префикса, проверить, что открылись Settings: назначение в тесте реально работает.
33. «a Modal suppresses global shortcuts»: открыть модель через `/model`, Alt+M не прибавляет счётчик `hotkeys-a`; после обычного Esc Alt+M работает.
34. «opening a Modal discards a pending stroke»: `command.reasoning: "g m"`, `clock: new ManualClock()`; нажать G, открыть выбор кликом по модели в Bottom line (паттерн `clickBottom` в `test/bottom-line.test.ts`), закрыть Esc до таймаута, затем `clock.advance(1000)`; префикс не появляется в поле.
35. «first assigned newline shortcut is shown and runs»: `input.newline: ["ctrl+x n", "alt+n"]`, `inputHints` оканчивается на `ctrl+x n new line`, пара вставляет одну строку (реплика `Model got {lastUser}` подтверждает `one\ntwo`).
36. «empty newline list keeps native Shift+Enter and hides Ctrl+J»: `input.newline: []`, подсказка `⇧⏎`; между `a` и `b` нажать Ctrl+J (kitty), между `b` и `c` — Shift+Enter; модель получает `ab\nc`.
37. «Shift+Enter can finish a newline sequence»: `input.newline: ["ctrl+x shift+return"]`, между `a` и `b` нажать пару, между `b` и `c` — Shift+Enter; модель получает `a\nb\nc`.

**Чат и завершение.**

38. «chat jump keys and hint follow Config»: в `test/chat.test.ts` копировать исходный тест с 120 строками; при `chat.top: "alt+u"`, `chat.bottom: "alt+d"` Ctrl+Home не прыгает, Alt+U показывает `Line 000` и `alt+d: jump to bottom`, Alt+D возвращает к `Line 119`. Исходный тест Ctrl+Home/Ctrl+End оставить. Check: `bun test test/chat.test.ts`.
39. Документация и регрессия: сверить поля и имя Config в `docs/extensions.md` с рабочей фикстурой; проверить `pnpm typecheck`, `pnpm lint` и `bun test test/hotkeys.test.ts test/keybindings.test.ts test/config.test.ts test/keyboard.test.ts test/composer.test.ts test/chat.test.ts`. Новый `test/hotkeys.test.ts` прогнать 10–15 раз отдельно перед закрытием. Если новый тест сразу зелёный, по `docs/agents/testing.md` временно сломать проверяемый путь, увидеть красный на нужном ожидании и восстановить свой код.

### Commands

- Typecheck: `pnpm typecheck`
- One test file (model): `bun test test/keyboard.test.ts`
- Full suite: `pnpm test`; `pnpm check` запускает typecheck, lint и полный набор, отдельно с увеличенным таймаутом.

### Pitfalls

- В OpenTUI 0.8.3 `preventDefault` блокирует сфокусированный элемент, но не следующие глобальные слушатели; у `ModalLayer` Esc обрабатывается даже если уже был `preventDefault`. Для задержки и расходования события нужны оба флага. `keyInput.processParsedKey` создаёт новый `KeyEvent` с чистыми флагами и доставляет его до текущего сфокусированного элемента; проверено на установленной версии. Не пересылать сырой ввод в `stdin` и не вызывать `handleKeyPress` напрямую.
- На базе Ctrl+X не вырезает даже выделенный текст (проверено на нативном textarea); поэтому тест с Ctrl+X ловит лишнюю букву, а контроль с Ctrl+K и курсором в начале ловит потерю или перестановку первого события. В тестах Alt отправляется как `{ meta: true }`; Shift+Enter — с kitty-вводом `startPiu` по умолчанию.
- Не смешивать умолчания и личные ключи обычным spread/merge: замена существующего ключа сохраняет его прежнее место и ломает приоритет Config. Не предъявлять ошибку опечатки внутри незагруженной, но найденной Extension: без выполнения её кода нельзя отличить её от существующего id; для загруженной проверка строгая.
- Не превращать Shift+Enter в управляемый редактором Config хоткей и не добавлять перехватчики Modules или запись личного Config; исключение для первого нажатия пары согласовано для сохранения нативной новой строки. Упомянуть его при закрытии тикета.

## Comments

Выполнено 2026-11-18 от базы `de806e8`.

- Шаги плана шли группами (объявление и Config, конфликты, доставка, чат), а не отдельным red→green на каждый из 38 пунктов. Для ключевых путей сделаны мутации и восстановлены: префиксные конфликты, таймаут 1 с, подсказка новой строки, подсказка `chat.bottom`; каждая роняла свой тест.
- `resolveKeybindings` назначает умолчания одним проходом по каталогу. `prepareKeybindings` ставит id из `defaultConfig.keybindings` в начало, поэтому умолчания `command.model` и `command.reasoning` попадают в первый слой, хотя их `source` — Extension для группировки во вкладке Hotkeys.
- `prepareKeybindings` принимает `Pick<Config, "keybindings">`, а не весь `Config`: других полей ей не нужно.
- Добавлена четвёртая фикстура `hotkeys-unplaced`: по `docs/agents/testing.md` для проверки «Extension не загружена» нужна фикстура, которую не размещает ни один другой тест, вместо сброса `hooks.loaded` у `hotkeys-a`.
- Сверх плана добавлены проверки: Esc выбрасывает печатаемый префикс, не повторяя его; последовательность новой строки съедает печатаемое первое нажатие. Пара, заканчивающаяся немодифицированным Esc, теперь ошибка запуска: маршрутизатор обязан трактовать Esc во время ожидания как отмену, иначе назначение было бы мёртвым.
- `AGENTS.md` дополнен: `keybindings` — исключение из слияния Config, личный слой разрешается в `prepareKeybindings`.
- В `GLOSSARY.md` пользовательские термины — **Keybinding action**, **Shortcut**, **Stroke**; `Chord` и `formatChord` остаются внутренними именами кода, как и просил план.
- `de806e8` уже падает на двух тестах `test/chat.test.ts` (`the agent Panel follows new output…` и `Ctrl+Home and Ctrl+End…`, последняя строка хвоста пустая) — проверено на чистом worktree. Они не связаны с тикетом и оставлены без изменений; новый тест `chat jump keys and hint` проходит 10/10.

Проверки: `bunx tsc --noEmit` и `bunx biome check .` чисто; `test/hotkeys.test.ts` 24/24 (10 прогонов подряд), `test/keybindings.test.ts`, `test/config.test.ts`, `test/keyboard.test.ts`, `test/composer.test.ts` зелёные; новый тест чата 10/10. Ручные пункты «После приёмки» остаются за пользователем.
