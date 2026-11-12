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

## Comments

- Сейчас `builtin/input/index.tsx` строит каждую slash-запись с `insert: /${command.name} `, а `accept()` только правит textarea; Enter и Tab из `routeList()` ведут туда. Сама локальная команда выполняется лишь в обработчике Enter для input, когда весь текст совпадает с `/name` (с необязательными аргументами). Поэтому выбор `/mod` вставляет `/model `, и Enter нужен второй раз.
- Реестр локальных команд: `Command` в `src/module.ts` содержит name, description и `run(context, args)`; `BoundCommand` передаёт аргументы с `""` по умолчанию (`src/app.tsx`). Встроенные команды лежат в `builtin/model/index.tsx`, `builtin/reasoning/index.tsx`, `builtin/chat/session-commands.tsx` и `src/lifecycle-commands.ts`. `/compact` уже получает текст после имени.
- Предлагаемый признак: добавить необязательный `takesArguments?: boolean` в `Command` со значением по умолчанию `true`, чтобы существующая или личная Extension-команда сохранила сегодняшнюю вставку. Встроенным командам без аргументов поставить `takesArguments: false`; `/compact` — единственная встроенная команда с аргументами. Не выводить это из имени, `run.length` или списка имён внутри input.
- Backend-команды: `RpcSlashCommand` в установленном Pi 1.5.0 (`dist/modes/rpc/rpc-types.d.ts`) не содержит метаданных об аргументах. У prompt templates есть внутренний `argumentHint` (`dist/core/prompt-templates.js`), но `get_commands` его не отдаёт (`dist/modes/rpc/rpc-mode.js`), поэтому piu не может отличить prompt template или extension command без аргументов. Считать все Backend-команды принимающими аргументы — сознательный выбор: `/btw` и `/skill:<name>` продолжают работать, а гипотетическая Backend-команда без аргументов потребует второго Enter. Вернуться к этому, если Pi добавит `argumentHint` в RPC-ответ.
- Тестовая обвязка: `test/autocomplete.test.ts` содержит проверки списка и вставки, `test/session.test.ts` перечисляет session-команды, `test/lifecycle-commands.test.ts` — lifecycle-алиасы. `startPiu` передаёт `--no-skills`, поэтому skill сейчас не покрыт; общая Backend-ветка проверяется prompt template и extension command, а для отдельной skill-проверки понадобится тестовая skill и поддержка в harness.
- Вне тикета: автодополнение аргументов после `/command `, изменение правила «локальная команда выполняется только для голого `/name`» и локальное выполнение Backend-команд. Тикет меняет только то, что происходит при выборе slash-записи; выбор мышью вынесен в тикет 08.

### Реализация

- `Command` в `src/module.ts` получил `takesArguments?: boolean` (по умолчанию `true`). `takesArguments: false` стоит у `/model`, `/reasoning`, `/new`, `/resume`, `/tree`, `/update`, `/restart`, `/q`, `/quit`, `/exit`; `/compact` его не имеет. Сверх списка в тикете помечен и `/update` — он тоже не принимает аргументов.
- Запись slash-списка теперь несёт саму `BoundCommand` (`Entry.command` в `builtin/input/autocomplete.ts`), а `accept()` решает по ней: если команда объявила `takesArguments: false` и в input нет ничего, кроме набираемого префикса (`field.plainText === typed`), поле очищается и команда выполняется; иначе работает прежняя вставка `/name `. Backend-записи команды не несут, поэтому всегда вставляются: `get_commands` не отдаёт признак аргументов.
- Историю input после такого выполнения пополняет полное `/name`, а не набранный префикс: `take()` разделён на `remember()` и очистку, и выбор `/mod` кладёт в историю `/model` — так же, как ввод команды целиком.
- `docs/extensions.md` описывает `takesArguments` и сигнатуру `run(context, args)`.
- Проверки в `test/autocomplete.test.ts`: Enter на `/mod` открывает model picker (и после него в Backend уходит ровно один промпт), Tab на `/reas` открывает reasoning picker, `/ne` очищает разговор, Up после выбора возвращает `/model`, `/comp` и `/gre` вставляются (у `/compact` отдельный Enter доводит дело до Pi: `Nothing to compact`), слово с текстом после курсора не выполняется, а вставляется. `Down moves the selection before Enter inserts` стал `…before Enter runs it` и проверяет Toast `/resume`; `Tab inserts the chosen entry` заменён на проверку выполнения `/reasoning`.
- Вставку prompt template по-прежнему покрывает существующая `typing narrows the list and Enter inserts the chosen entry instead of sending`; новая проверка Backend-ветки сделана на extension command, потому что skill недоступен при `--no-skills`. Сценарий «в input есть другой текст» проверен на слове с хвостом после курсора: другой текст может стоять только за курсором (триггер требует, чтобы текст до курсора начинался с `/` и не содержал пробелов), а вертикальный сдвиг курсора в OpenTUI (`editorView.moveUpVisual`) не шлёт `cursor-changed`, поэтому многострочный вариант список просто не открывает. Это поведение было и до тикета и не менялось.
- Тесты: `bun test test/autocomplete.test.ts` — 19 проверок, 10 прогонов подряд зелёные; `pnpm check` — 426 pass, единственный fail (`test/polish.test.ts` «an automatic compaction leaves the chat matching Pi's messages», `No more faux responses queued`) воспроизводится и на HEAD без этих изменений.
