# 29: Вкладка «Extensions» в Settings со списком extensions

**What to build:** В Modal «Settings» (тикет 32) появляется встроенная вкладка «Extensions», вторая после Global. На ней две группы:

- **Agentic** — Pi extensions, которые загружает Backend: файлы из папки extensions agent dir, пакеты из Pi settings и встроенные в Pi-Bolt (MCP, llama.cpp, Codemode, tool search).
- **Interface** — Extensions piu: встроенные и личные из `~/.piu/extensions` (или `$PIU_HOME/extensions`).

У каждой строки видно имя, откуда она (файл, пакет, встроенная, личная) и включена ли она. В этом тикете список только для чтения: переключение и удаление — тикет 30.

**Blocked by:** 32 (Modal «Settings» с вкладками и вкладка Global).

**Status:** done

## Критерии приёмки

- [x] Вкладка «Extensions» встроенная, видна всегда и стоит после Global; добавлена тем же механизмом вкладок, что и в тикете 32.
- [x] Группа Agentic показывает каждый Pi extension, который Backend нашёл бы при старте, и его состояние по Pi settings: выключенный файл (`-extensions/…`), пакет с `"extensions": []`, выключенный встроенный. Правила поиска и выключения взяты из документации установленного Backend (`settings.md`, `packages.md`, `extensions.md`), не по памяти.
- [x] Группа Agentic читает тот же agent dir, что и Backend: `PI_CODING_AGENT_DIR`, если он задан, иначе каталог по умолчанию.
- [x] Группа Interface показывает каждую найденную Extension; Extension с Pi extension внутри помечена (её Pi-часть не показывается отдельной строкой в Agentic).
- [x] Построение списка не запускает Backend и не выполняет код Pi extensions.
- [x] Список прокручивается, если не помещается.
- [x] `GLOSSARY.md`: записать группы Agentic и Interface (термин Settings и «Pi settings» вводит тикет 32).

### Проверки

- [x] Проверка через `startPiu` с временным agent dir, где есть включённый и выключенный файл Pi extension и пакет с `"extensions": []`: обе группы и состояния видны в кадре.
- [x] Проверка с личной Extension во временном `PIU_HOME`: она в группе Interface с пометкой «личная».
- [x] Тесты не читают настоящий agent dir и `~/.piu`.

## Notes

- Встроенные Pi extensions Pi-Bolt включаются и выключаются через `pi config`; как это записано в Pi settings, найти в документации установленного Pi-Bolt.
- Будущее: для Interface Extensions с Modules позже появится смена позиции прямо из этого окна (правка Placement). Вёрстку строки не делать так, чтобы это потом мешало.

## Ticket plan

Base: `2712723` on `main`, planned 2026-11-20.

### Rules for the implementer

- Follow this plan: its approach, files, signatures and test cases are decided. The acceptance criteria above still define done.
- First run the stale check: `git diff --stat 2712723 HEAD -- GLOSSARY.md src/app.tsx src/backend-command.ts src/update-install.ts src/extension-inventory.ts src/settings-extensions.tsx src/settings.tsx test/settings-extensions.test.ts test/settings.test.ts test/hotkeys-settings.test.ts`. No output means the plan is current.
- The seam and test cases under Steps are pre-agreed with the user; they satisfy `tdd`'s seam confirmation.
- Local fixes are yours to make: imports, local names, formatting, an extra test case for an edge case you find.
- Stop before review and commit, leaving the work uncommitted, when the stale check prints anything, when a path, symbol or signature here differs from the code, when a file outside Changes must change, when a step's check stays red after a local fix, or when every step is done and an acceptance criterion is still unmet. Report the step, what the plan expected, and what you found.

### Approach

Добавить встроенную вкладку Extensions после Global и перед Hotkeys. При каждом входе на вкладку собрать снимок Agentic с диска, а Interface — из уже найденных папок и активного Placement; в Interface вывести отдельные подгруппы **Builtin extensions** и **External extensions** (личные из каталога piu). Состояние Agentic — из настроек agent dir, не из запущенного процесса: по согласованию с пользователем не включать проектные `.pi`-ресурсы, разовые аргументы вроде `-e` и `--no-extensions` и содержимое конкретной сборки Pi-Bolt.
Rejected: запрашивать инвентарь у Backend: RPC не отдаёт полный список с выключенными строками, а запуск отдельной команды Backend противоречит требованию.

### Reuse

- `src/settings.tsx`: `SettingsTab`, общий `TabBody` и `resetScroll`; не создавать вложенный scrollbox и не менять механизм вкладок.
- `src/extensions.ts`: `ExtensionFolders`, `builtinDir`, `ResolvedPlacement.enabledExtensions` и то же соглашение `<dir>/pi-extension.ts`. Не импортировать неразмещённые Extensions для получения метаданных.
- `src/update-install.ts`: перенести существующий `backendEnvironment` и разбор agent dir вместо создания второго варианта.
- Источник правил: установленные Pi-Bolt `docs/settings.md#resources`, `docs/packages.md`, `docs/extensions.md`, `docs/environment-variables.md`; те же четыре `builtin:` записи документированы в установленном stock Pi 1.5.0. Для деталей локального поиска сверяться с `node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.js`, не импортировать этот модуль.
- `test/settings.test.ts`: образец переключения вкладок и проверки прокрутки; `test/harness.ts`: `startPiu`, `openSettings`, `modalBounds`, `backendEnv`, `homeFromHomeDir`, `PIU_PID_LOG`.

### Changes

- `src/backend-command.ts` (edit): экспортировать перенесённый `backendEnvironment` с прежним разбором ведущих присваиваний `NAME=value` в `config.args`; добавить `backendAgentDir` с перенесённым разбором: `env.HOME ?? homedir()`, непустой `PI_CODING_AGENT_DIR` либо `<home>/.pi/agent`, раскрыть `~`, `~/`, `file://`, относительный путь разрешить от cwd Backend.
- `src/update-install.ts` (edit): импортировать два помощника вместо локального разбора; `planBackendUpdate` — без изменений сигнатуры и поведения.
- `src/app.tsx` (edit): `createApp` передаёт `folders` и `placement.enabledExtensions` как новый обязательный prop `extensionInventory: Pick<ExtensionInventoryOptions, "folders" | "enabledExtensions">` внутреннего `App`; `agentDir` вычислить внутри callback `readExtensions`, который `App` передаёт в `createSettings`, через `backendAgentDir(props.cwd, backendEnvironment(props.config.backend, props.env))`. В callback также брать `home` из вычисленного окружения Backend (`env.HOME ?? homedir()`); `createApp` не начинает чтение Pi settings. Ошибку вычисления пути обработать так же, как ошибку чтения Agentic: показать в его группе, оставив Interface доступной.
- `src/extension-inventory.ts` (new): чистое по побочным эффектам чтение метаданных ФС — никогда не импортировать или читать исходники Pi extensions, не вызывать RPC, процессы, менеджеры пакетов или сеть. Модель и порядок ниже.
- `src/settings-extensions.tsx` (new): `createExtensionsTab` возвращает `{ title: "Extensions", render }`; `render` вызывает `read` один раз на монтирование в keyed `TabBody`. Заголовки: `Agentic`, затем `Interface` с `Builtin extensions`, затем `External extensions`. Подгруппы видны и при пустом списке (`None`). Строка — самостоятельный box с именем (`theme.text`), происхождением и состоянием (`theme.muted`), без фокуса, выбора, обработчиков и действий. Использовать перенос слов для длинной строки и `flexShrink={0}` для строки. Формат деталей: `file: <path>`, `package: <source>`, `builtin` или `personal`; далее `enabled`, `disabled` или `unavailable`, потом `+ Pi extension` при наличии. Для файлов показывать путь относительно agent dir, если внутри, иначе абсолютный; для строки пакета имя файла/путь внутри пакета, а в деталях — исходный source. Ошибка чтения Agentic выводится перед его строками цветом `theme.error`.
- `src/settings.tsx` (edit): добавить к опциям `createSettings` `readExtensions(): ExtensionInventory`; порядок `[global, extensions, hotkeys.tab, ...options.tabs]`; по умолчанию Global, `/hotkeys` по-прежнему открывает Hotkeys напрямую. Не менять `BuiltinSettingsTab` и не добавлять команды.
- `test/settings-extensions.test.ts` (new): проверки ниже, публичный вход только через `startPiu`. Фикстуры Agentic создавать в темп-каталогах в самом тесте, для Interface использовать существующий `test/fixtures/extensions/counter/pi-extension.ts` и соседний `index.tsx` (копировать только папку counter во временный корень `extensions`).
- `test/settings.test.ts` (edit): обе проверки `Global +Hotkeys +Profile` → `Global +Extensions +Hotkeys +Profile`; в тесте Ctrl+PgUp/PgDn три нажатия в каждую сторону вместо двух. Остальной сценарий сохранить.
- `test/hotkeys-settings.test.ts` (edit): в `openHotkeys(piu: Piu)`, в переходе из Global в сценарии ввода назначаемого сочетания и в сценарии Restart послать второе `\x1b[6;5~` перед ожиданием списка Hotkeys; не удваивать нажатие внутри записи сочетания.
- `GLOSSARY.md` (edit): после Settings tab определить **Agentic** как инвентарь Pi extensions из настроек agent dir и встроенных Pi extensions, **Interface** как инвентарь Extensions piu, разделённый на поставляемые с piu и личные.

```ts
// src/backend-command.ts
export function backendEnvironment(config: BackendConfig, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function backendAgentDir(cwd: string, env: NodeJS.ProcessEnv): string;

// src/extension-inventory.ts
export type ExtensionInventoryOptions = {
  agentDir: string;
  home: string;
  folders: ExtensionFolders;
  enabledExtensions: ReadonlySet<string>;
};
type AgenticRow = { name: string; state: "enabled" | "disabled" | "unavailable" } & (
  | { kind: "file"; path: string }
  | { kind: "package"; source: string }
  | { kind: "builtin" }
);
type InterfaceRow = { name: string; enabled: boolean; hasPiExtension: boolean };
export type ExtensionInventory = {
  agentic: readonly AgenticRow[];
  agenticError?: string;
  builtin: readonly InterfaceRow[];
  external: readonly InterfaceRow[];
};
export function readExtensionInventory(options: ExtensionInventoryOptions): ExtensionInventory;

// src/settings-extensions.tsx
export function createExtensionsTab(read: () => ExtensionInventory): SettingsTab;
```

**Правила инвентаря:**

- Interface: пройти `folders` без повторного поиска и импорта. Если родитель папки — `builtinDir`, строка в Builtin extensions, иначе в External extensions; метка `personal` для External. Имена — ключи карты; состояние — `enabledExtensions.has(name)`; метка Pi — по наличию `pi-extension.ts` ровно как при добавлении `-e`. Канонические пути всех таких Pi-файлов исключить из Agentic, даже если они упомянуты в settings, идут через symlink или их Extension не размещена.
- Agentic: читать `<agentDir>/settings.json` и манифесты `package.json` как JSON, с поддержкой UTF-8 BOM. Отсутствующий файл настроек считать пустыми настройками; невалидный или нечитаемый файл даёт `agenticError` и не скрывает найденные файлы, встроенные пункты и Interface. Для `extensions`, `packages` и полей манифеста брать только элементы нужного типа; невалидный манифест читать как отсутствующий, недоступный каталог пропустить.
- Файлы: обнаруживать `.ts` / `.js` непосредственно внутри `extensions/` и входы подпапок: манифест `pi.extensions` с существующими файлами, иначе `index.ts`, иначе `index.js`. Так же проверить вход самого каталога прежде, чем перечислять его содержимое. При автоматическом обходе не уходить глубже подпапок, не перечислять dot entries и `node_modules`; явно указанные пути допускаются. Обычные пути из settings добавляют файл или каталог с тем же поиском. Разрешать их от agent dir, абсолютные и `~` тоже поддержать (поле `home` из `ExtensionInventoryOptions`, не из `PIU_HOME`). Для манифестных путей база — корень манифеста; glob через `Bun.Glob`, сканировать без перехода по симлинкам при обходе шаблона, явно заданный симлинк разрешать. Сравнивать пути в фильтрах до `realpath`; `realpath` применять для исключения Interface Pi-файлов и удаления дублей (если не удалось, полный нормализованный путь). При совпадении оставлять строку явного файла, затем автоматически найденного, затем пакета.
- Фильтры: у auto и явных файлов обычный путь — источник, не белый список; исключить совпадения `!glob`, после них включить точные `+path`, после них исключить точные `-path`. Для сравнения нормализовать `./` и разделители, сверять путь относительно базы и абсолютный путь; `+` и `-` не трактовать как glob. Выключенные файлы оставлять в списке. Для четырёх встроенных ID (`builtin:mcp`, `builtin:llama.cpp`, `builtin:codemode`, `builtin:tool-search`) использовать те же исключения и включения по ID, по умолчанию все включены; сами IDs никогда не передавать в файловый поиск.
- Пакеты: брать строку source или объект `{ source, extensions?, autoload? }` из `packages`. Относительный local source — от agent dir; файл даёт одну запись, каталог — `pi.extensions` манифеста или обычный каталог `extensions/` по правилам установленного package manager. Для `npm:<name>[@<version-or-range>]` (в том числе scoped name) смотреть только `<agentDir>/npm/node_modules/<name>`; для git/URL — `<agentDir>/git/<host>/<repo path>` без ref и суффикса `.git` (не считать путь допустимым, если выходит из managed root). Не искать в глобальных корнях npm и не устанавливать отсутствующее. Для находящегося на диске пакета без Pi extensions строк не добавлять. Если configured root недоступен, оставить одну строку с именем и source равными source, состоянием `unavailable`, а при явном `extensions: []` — `disabled`.
- Для пакета сначала определить разрешённые манифестом точки входа; только затем сузить настройкой пакета. Отсутствие фильтра включает все разрешённые, `[]` выключает все; обычные шаблоны задают белый список, потом применить `!`, `+`, `-` с тем же приоритетом. Ни один фильтр не добавляет файл за пределами найденных точек входа. При `autoload: false` по умолчанию ничего не включать: обычные совпадения и `+` включают, `!` и `-` исключают с тем же приоритетом. Все найденные выключенные Pi extensions показать с типом package и исходным source.
- Порядок Agentic: file, package, builtin; внутри по имени, для одинаковых имён по имени источника или пути. Каждую подгруппу Interface сортировать по имени. Для воспроизводимого порядка сравнивать строки по кодовым единицам, не по локали.

### Steps

Seam: `startPiu` → команда `/settings` → Ctrl+PgDn или выбор вкладки мышью → кадр и положение прокрутки. Model test: `test/settings.test.ts` (выполнено на базе: 19 pass).

1. Test "Extensions is the second built-in Settings tab": дать конфиг с тем же минимальным Placement, что в `test/settings.test.ts`; открыть Settings; проверить строку вкладок `Global +Extensions +Hotkeys`; нажать Ctrl+PgDn один раз и дождаться Agentic и Interface; Global по умолчанию не меняется. Red, then green в `src/settings.tsx`, `src/settings-extensions.tsx`, `src/app.tsx`. Обновить тесты обхода вкладок, перечисленные в Changes. Check: `bun test test/settings-extensions.test.ts`, `bun test test/settings.test.ts`, `bun test test/hotkeys-settings.test.ts`.
2. Test "Agentic shows user files, filtered installed packages and Pi built-ins": задать `backendEnv.PI_CODING_AGENT_DIR` отдельным временным путём, отличным от обычного harness `<dir>/agent`. После появления модели записать туда settings и создать `active.ts`, подпапку `nested/index.js`, `off.ts`, `-extensions/off.ts`, `-builtin:mcp`; добавить local-пакет с манифестом и третий файл, отключить его пакетным `extensions: []`. В одном кадре при height=72 проверить строки с именем, источником и состоянием, плюс заголовок Interface; убедиться, что `builtin:tool-search` включён. Red, then green в `src/backend-command.ts`, `src/update-install.ts`, `src/extension-inventory.ts`, подключить через `src/app.tsx`. Check: `bun test test/settings-extensions.test.ts`, `bun test test/backend-update.test.ts`.
3. Test "Agentic falls back to the Backend home when the agent dir is unset": передать `backendEnv` с пустым `PI_CODING_AGENT_DIR` и `HOME` внутри временного каталога (и `homeFromHomeDir: true`), подготовить уникальный файл в `<backend HOME>/.pi/agent/extensions`; видеть только его, не маркер из обычного harness `<dir>/agent`. Red before fallback wiring, then green в `src/backend-command.ts`. Check: `bun test test/settings-extensions.test.ts`.
4. Test "Interface separates built-in and external extensions without repeating their Pi part": временный `PIU_HOME` с неразмещённым counter. После запуска вписать абсолютный путь к его `pi-extension.ts` в Pi settings. В достаточно высоком кадре убедиться, что включённый `chat` под Builtin extensions; `counter` под External extensions — `personal`, `disabled`, `+ Pi extension`; Agentic не содержит его файла. Проверять подстроки соответствующих частей Modal, а не глобальный порядок совпадений по всему экрану. Red, then green в `src/extension-inventory.ts` и `src/settings-extensions.tsx`. Check: `bun test test/settings-extensions.test.ts`.
5. Test "Opening Extensions discovers a new file without running it or restarting the Backend": дождаться модели и первого `pids.jsonl`, сохранить содержимое лога. Один раз открыть вкладку и уйти в Global; добавить в temp agent dir валидный `.ts` с записью marker при выполнении верхнего уровня. Вернуться и дождаться строки; marker отсутствует, лог не менялся. Перехватывать только наблюдаемые эффекты тестом; дополнительно проверить в коде, что сборщик не содержит spawn, RPC или import исходников (одного PID-лога недостаточно, чтобы обнаружить произвольный subprocess). Red при кэше между входами или включённом импорте, then green в `src/settings-extensions.tsx` и `src/extension-inventory.ts`. Check: `bun test test/settings-extensions.test.ts`.
6. Test "The Extensions list scrolls below fixed tabs and resets on tab switch": height=24, создать 30 файлов с сортируемыми именами; дождаться первого; прокрутить вниз в границах Modal до последнего, проверить наличие полосы и отсутствие первой строки; сменить вкладку на Global и обратно, снова увидеть первую строку. Red с зафиксированным либо не сбрасываемым scroll, then green через существующий `TabBody`; не добавлять собственный scrollbox. Check: `bun test test/settings-extensions.test.ts`.
7. Обновить Glossary. Проверить, что обе группы названы рядом с Settings tab и подразделы Interface не названы «Pi extensions». Check: `git diff --check`. Перед сдачей выполнить команды ниже; новый файл тестов прогнать 10 раз по `docs/agents/testing.md`.

### Commands

- Typecheck: `pnpm typecheck`
- One test file: `bun test test/settings-extensions.test.ts`
- Full suite: `pnpm check`

### Pitfalls

- Harness подаёт `PI_CODING_AGENT_DIR` как присваивание в `backend.args` после `env`; прямое чтение `process.env` не найдёт нужный каталог. Во всех новых тестах явно ограничить Backend и app временными каталогами; fallback-тест также подменяет HOME, а не читает настоящий.
- Порядок вкладок — изменение клавиатурной навигации, не публичная команда: `/hotkeys` не должен зависеть от индекса.
- Источники ошибок и недоступные пакеты нельзя выдавать за выполненный запуск; вкладка только читает настройки и локальные метаданные. Не сохранять Config и Pi settings и не запускать compile.

## Comments

Отклонения от плана:

- `readInterfaceInventory` в `src/extension-inventory.ts` — лишний публичный экспорт вне согласованного списка сигнатур: он нужен ветке ошибки вычисления agent dir в `src/app.tsx`, чтобы Interface оставалась доступной. Ветка достижима (`PI_CODING_AGENT_DIR=file://`), но тестом не покрыта.
- `AgenticRow.path` хранит путь для показа (относительный к agent dir, если внутри), отдельного поля для отображения нет. Имя файловой строки — basename без расширения: план задавал имя только для строк пакета, а `nested/index.js` иначе давал бы две строки `index`.
- Правило «исключить канонические пути Pi-файлов Interface» распространено и на строки пакетов: файл Extension, перечисленный только как пакет, в Agentic не попадает. Проверено мутацией (удаление сверки с `piFiles` в пакетной ветке роняет тест шага 4). Заодно строки пакетов дедуплицируются с файловыми по canonical-пути, как требует «При совпадении оставлять строку явного файла».
- Пакет, заданный файлом, показывается `enabled` и при `"extensions": []`: установленный `package-manager.js` (`resolveLocalExtensionSource`) добавляет файл без фильтра, а критерий требует правил Backend, не документации.
- `autoload: false` реализован как «последний совпавший шаблон побеждает» — так работает `applyAutoloadDisabledPatterns` в установленном пакете. Фразу «с тем же приоритетом» читал как «тот же набор шаблонов (`!`, `+`, `-`)», а не как порядконезависимый приоритет.
- `matchesAny` сверяет ещё и basename: так делает `matchesAnyPattern` установленного пакета; план перечислял два кандидата из трёх.
- Тест `the Agentic inventory reads metadata without running anything` сверяет текст `src/extension-inventory.ts` — этого требовал шаг 5 плана (PID-лога недостаточно, чтобы увидеть произвольный subprocess). Тест структурный: он останется зелёным, если сборщик ничего не делает, поэтому поведение закрыто соседним тестом с marker-файлом.
- Тест сброса прокрутки проверен мутацией иначе, чем предполагал план: удаление одного `resetScroll?.()` его не роняет, потому что keyed `TabBody` пересоздаётся. Красным он становится только при снятии обоих механизмов (remount + `resetScroll`) — сброс даёт их пара.
- Тест шага 2 задаёт пакет манифестом с glob (`"./extensions/*.ts"`), то есть проверяет и разворачивание glob из манифеста.

Проверки:

- `pnpm check` не проходит из-за lint в чужих файлах: `biome check .` падает на закоммиченных в HEAD `test/zz-debug.test.ts` и `test/zz-debug2.test.ts` (format, `noUnusedImports`, `noUnusedVariables`). На чистом дереве (`git stash`) те же четыре ошибки, так что это не следствие тикета; файлы не трогал.
- `pnpm typecheck` чистый; полный `bun test` — 766 pass, 0 fail; `test/settings-extensions.test.ts` прогнан 10 раз подряд (7 pass каждый).
