# 29: `/settings` и Modal «Settings» со списком extensions

**What to build:** Команда `/settings` открывает Modal «Settings» с вкладками. Пока вкладка одна, «Extensions». На ней две группы:

- **Agentic** — Pi extensions, которые загружает Backend: файлы из папки extensions agent dir, пакеты из Pi settings и встроенные в Pi-Bolt (MCP, llama.cpp, Codemode, tool search).
- **Interface** — Extensions piu: встроенные и личные из `~/.piu/extensions` (или `$PIU_HOME/extensions`).

У каждой строки видно имя, откуда она (файл, пакет, встроенная, личная) и включена ли она. В этом тикете список только для чтения: переключение и удаление — тикет 30.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Критерии приёмки

- [ ] `/settings` есть в `/` всегда, при любом Placement: команда встроенная, как `/restart` и `/update`, а не часть Extension (команды Extension без Module в Placement в `/` не попадают).
- [ ] Modal «Settings» имеет полосу вкладок; вкладка «Extensions» открыта по умолчанию. Добавить вторую вкладку можно без переделки Modal.
- [ ] Группа Agentic показывает каждый Pi extension, который Backend нашёл бы при старте, и его состояние по Pi settings: выключенный файл (`-extensions/…`), пакет с `"extensions": []`, выключенный встроенный. Правила поиска и выключения взяты из документации установленного Backend (`settings.md`, `packages.md`, `extensions.md`), не по памяти.
- [ ] Группа Agentic читает тот же agent dir, что и Backend: `PI_CODING_AGENT_DIR`, если он задан, иначе каталог по умолчанию.
- [ ] Группа Interface показывает каждую найденную Extension; Extension с Pi extension внутри помечена (её Pi-часть не показывается отдельной строкой в Agentic).
- [ ] Построение списка не запускает Backend и не выполняет код Pi extensions.
- [ ] Modal закрывается Esc и кликом вне него; список прокручивается, если не помещается.
- [ ] `GLOSSARY.md`: Config сейчас запрещает слово «Settings» как занятое настройками Pi. Пользователь выбрал «Settings» как имя Modal; добавить термин для Modal, а Pi'шные называть «Pi settings», и записать группы Agentic и Interface.

### Проверки

- [ ] Проверка через `startPiu` с временным agent dir, где есть включённый и выключенный файл Pi extension и пакет с `"extensions": []`: обе группы и состояния видны в кадре.
- [ ] Проверка с личной Extension во временном `PIU_HOME`: она в группе Interface с пометкой «личная».
- [ ] Тесты не читают настоящий agent dir и `~/.piu`.

## Notes

- Встроенные Pi extensions Pi-Bolt включаются и выключаются через `pi config`; как это записано в Pi settings, найти в документации установленного Pi-Bolt.
- Будущее: для Interface Extensions с Modules позже появится смена позиции прямо из этого окна (правка Placement). Вёрстку строки не делать так, чтобы это потом мешало.
