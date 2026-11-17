# 35: Живой вывод субагента в его окне через child-launch hook

**What to build:** Пока субагент работает, его окно (Modal, который открывается по карточке `agent @id`) показывает сообщение, которое child ещё стримит: мысли, текст, вызовы инструментов по мере их объявления, и обновляется несколько раз в секунду. Готовое сообщение появляется ровно один раз: не дважды и не теряется между живым снимком и файлом сессии.

**Blocked by:** None (ticket 22 done).

**Status:** done

## Критерии приёмки

- [x] Запущенный child получает от piu reporter (Pi extension) и переменную `PIU_SUBAGENT_LIVE_DIR` через `pi-subagents:child-launch:v1`; при любой ошибке в нашем обработчике launch остаётся нетронутым и субагент запускается.
- [x] Открытое окно субагента показывает недописанное сообщение child'а до того, как оно попало в файл сессии, и обновляет его не реже нескольких раз в секунду.
- [x] Когда сообщение сохранено в сессию, окно показывает его один раз: живой снимок с тем же `timestamp` отбрасывается.
- [x] Живой снимок нового сообщения после сохранённого показывается после него, нумерация `n` остаётся сплошной.
- [x] Поломанный или недописанный живой файл считается отсутствующим; запись атомарна (temp + rename).
- [x] Повторный launch (revival) того же агента работает с той же папкой.
- [x] Папка живых снимков удаляется на `session_shutdown`, обработчик события снимается.
- [x] Вне задачи: сворачиваемый блок `▸ Thinking` как в основном чате (решения нет), вложенные агенты (`indent > 0`), Pi TUI.

### Проверки

- [x] Тесты через `startPiu` (список ниже), у каждого проведена мутационная проверка.
- [x] `test/subagents.test.ts` проходит 10 раз подряд.
- [x] `pnpm exec tsc --noEmit` и `pnpm exec biome check` по изменённым файлам чисты.

## Notes

Проверено чтением исходников, ничего не запускалось.

- `@chthub/pi-subagents` 0.5.0 (`~/.pi/agent/npm/node_modules/@chthub/pi-subagents/`, только чтение) запускает child как `pi --mode rpc` (`rpc-client.ts:82`, `"pi"` из PATH, не наш Backend). Родитель получает стрим `message_update` (`agent-process.ts:578`, `assistant-stream.ts`), но отдаёт его только поверхностям Pi TUI, которые под RPC ничего не делают. Живые данные есть только в памяти родителя.
- Публичный вход: событие `pi-subagents:child-launch:v1` (`child-launch.ts`, README «Child-launch integration event», SPEC «Child-launch integration»). Перед каждым запуском и revival пакет вызывает `pi.events.emit(..., launch)` со свежим `{ env, extensions, error? }`. Слушатель может добавить абсолютные пути в `extensions` (каждый станет `--extension <path>` у child) и записи в `env`. Идентификационные переменные child'а сильнее наших. Правила: слушатель синхронный; сам ловит свои ошибки; `error` прерывает запуск (мы его не ставим); отписка на `session_shutdown`.
- `pi.events` — общая шина всех Pi extensions в одном процессе, поэтому `builtin/chat/pi-extension.ts`, загруженный в родительский Backend, слышит emit пакета.
- В child'е Pi extension получает `pi.on("message_update", e => …)`; `e.message` — копия частичного assistant-сообщения (`pi-agent-core/dist/agent-loop.js` ~306), собирать из дельт не нужно. `message_end` несёт финальное, Pi сохраняет его в сессию в том же проходе (`dist/core/agent-session.js` ~768–780).
- `AssistantMessage.timestamp` (`pi-ai/dist/types.d.ts` ~398) ставится при старте запроса и совпадает у частичного и финального сообщения; по нему сопоставляем снимок с сохранённым.

Отвергнуто: свой фреймворк субагентов (около 8k строк восстановления, доставки, сообщений и лимитов глубины; наши tools с теми же именами остановят Pi-Bolt, ADR-0001); чтение stdout child'а и патч пакета (не наш код, ломается при обновлении).

## Design

Обе части — Pi extensions внутри встроенного Extension `chat`, ничего не кладётся в agent dir пользователя, пакет не меняется.

1. **Родитель, `builtin/chat/pi-extension.ts` (edit).** `pi.events.on("pi-subagents:child-launch:v1")`. На первом emit создать одну папку на процесс Backend (`mkdtempSync(join(tmpdir(), "piu-subagents-live-"))`), добавить в `launch.extensions` абсолютный путь `fileURLToPath(new URL("./subagent-live.ts", import.meta.url))`, поставить `env.PIU_SUBAGENT_LIVE_DIR`. Всё в try/catch, при сбое `launch` не трогать. На `session_shutdown` отписаться и удалить папку. В `readLog` читать ещё `<dir>/<agentId>.json`; шорткат «размер не изменился → пропустить» должен учитывать и живой файл. Публиковать `transcript(session) + live`, живые записи отбрасывать, если в сессии уже есть assistant-сообщение с тем же `timestamp`.
2. **Child, `builtin/chat/subagent-live.ts` (new).** Ничего не делает без `PI_SUBAGENT_AGENT_ID` и `PIU_SUBAGENT_LIVE_DIR`. На `message_update` assistant-сообщения пишет `{ v: 1, timestamp, entries }` в `<dir>/<agentId>.json` атомарно, не чаще раза в ~200 мс, плюс финальная запись на `message_end`. Глотает все ошибки fs. Не регистрирует tools и команды. Импортирует только `../../src/subagents.ts` и node builtins.
3. **Общий формат, `src/subagents.ts` (edit).** Вынести ветку assistant-content из `transcriptFromSession` в экспортируемый helper (одинаковые записи и лимиты обрезки у живого и сохранённого). Разбор сессии отдаёт timestamps assistant-сообщений. Добавить сериализатор и парсер живого снимка с `v: 1`, как `serializeLog` / `parseLog`. `n` после слияния сплошной (см. `// why:` над `Entry` в `subagent-view.tsx`).
4. **Окно** (`builtin/chat/subagent-view.tsx`) читает `pi.subagentLogs` и не должно меняться; если изменится, записать причину в Comments.

## Тесты (через `startPiu`; до начала прочитать `docs/agents/testing.md` и `docs/agents/pi-extensions.md`)

- Stand-in `test/fixtures/pi-extensions/subagents.ts` на spawn делает `pi.events.emit("pi-subagents:child-launch:v1", launch)` со свежим `{ env: {}, extensions: [] }`, копирует важную валидацию (синхронность; `error` прерывает запуск) и пишет итоговый launch в `<PIU_STANDIN_SUBAGENTS>/launch-<agentId>.json`. Обновить комментарий в начале файла и пункт про stand-in в `docs/agents/testing.md`.
- `test/subagents-control.ts`: `live(agent, timestamp, ...blocks)` читает папку из записанного launch и пишет снимок сериализатором из `src/` (тесты могут импортировать `src/`, stand-in нет). `say` получает необязательный timestamp.
- Случаи:
  1. launch запущенного child'а содержит абсолютный путь reporter'а и `PIU_SUBAGENT_LIVE_DIR`.
  2. Открытое окно показывает живой снимок («Half a sent») раньше, чем сообщение есть в файле сессии.
  3. Сохранённое сообщение с тем же timestamp заменяет живое: финальный текст в кадре один раз, частичного нет.
  4. Живой снимок нового сообщения после сохранённого: видны оба, по порядку.
  5. Reporter в настоящем Pi: `startPiu` с `extraBackendArgs: ["-e", <path>]` и `backendEnv` с `PI_SUBAGENT_AGENT_ID` и `PIU_SUBAGENT_LIVE_DIR` во временной папке, медленный ответ (`tokensPerSecond` в `FauxScript`): до конца ответа `<dir>/<id>.json` держит часть текста, после — весь.
- Известные падения до этого тикета (не чинить, назвать pre-existing): Biome в `test/input-dir.test.ts` и `test/modal.test.ts`; пять тестов в design, session ×2, polish, ask-user.

## Подводные камни

- Дети детей: reporter загружается только в прямых детей, у их процесса нет слушателя на стороне родителя, живого вывода внуков не будет. Совпадает с фильтром `indent === 0`, не трогать.
- Revival (`--session` перезапуск остановленного child'а) снова эмитит hook: reporter обязан пережить второй launch с тем же id и той же папкой.
- Polling идёт только пока child `running` (+3 с запаса): достаточно, стрим бывает только во время работы.

## Docs в том же изменении

- `docs/agents/pi-extensions.md`, пункт про subagents: сейчас там «no half-streamed text»; описать hook, reporter и дедупликацию по timestamp.
- `docs/agents/testing.md`, пункт про stand-in: launch-событие и `live()`.

## Не проверяется в песочнице

Работает ли это с настоящим пакетом и у автора: какой `pi` из PATH запускает детей, Pi-Bolt как родитель. После реализации: пользователь запускает настоящий фоновый `agent_spawn` с длинным ответом, открывает карточку и смотрит, растёт ли текст; плюс `! bun scripts/pi-bolt-compat/run.ts` (в песочнице падает с EACCES).

## После приёмки (вручную)

- [ ] Запустить настоящий фоновый `agent_spawn` с длинным ответом, открыть карточку и посмотреть, растёт ли текст (какой `pi` из PATH запускает детей, Pi-Bolt как родитель — в песочнице не проверить).
- [ ] `! bun scripts/pi-bolt-compat/run.ts` (в песочнице падает с EACCES).

## Comments

- Deviation: reporter без trailing-таймера. Он пишет на `message_update` не чаще раза в 200 мс и всегда на `message_end`. Таймер ничем не проверялся (мутация, убирающая его, пережила тест с настоящим Pi), а хвост всё равно пишет `message_end`. Цена: если поток замолчал сразу после пропущенного обновления, окно отстаёт не больше чем на 200 мс текста до следующего обновления.
- Deviation: `transcriptFromSession` теперь возвращает `{ entries, assistantTimestamps }`, а не массив; `say` в `subagents-control.ts` не менялся, timestamp задаёт новый `sayAt`. `readLog` теперь читает и тогда, когда файла сессии ещё нет (он появляется с первым законченным сообщением), и вызывается и для агента без `sessionPath`.
- Не покрыто тестом, только по построению: папка живых снимков удаляется на `session_shutdown`; revival того же агента (тот же id и та же папка, `liveDir ??=`); битый живой файл (`parseLive` отдаёт `undefined`); сбой в обработчике launch не меняет launch (try/catch). Stand-in не делает revival и не умеет ронять слушатель.
- Мутации (по одной, каждая краснит целевой тест): без `REPORTER` в `launch.extensions` → тест launch; игнор живого файла → тесты 2–4; без дедупа по timestamp → тест 3; живое перед сохранённым → тест 4; сигнатура без живого файла → тесты 2–3; reporter без записи на `message_update` и без записи на `message_end` → тест с настоящим Pi.
- Проверено: `test/subagents.test.ts` 10 прогонов подряд, 17/17 каждый; `tsc --noEmit` и `biome check` по изменённому чисты. Полный `pnpm check` и соседние наборы (`session`, `modal`, `ask-user` и др.) не запускались; о pre-existing падениях см. комментарии тикета 22.
- Остаток после сбоя: при убитом (SIGKILL) Backend папка в tmpdir остаётся; чистится только на `session_shutdown`.
