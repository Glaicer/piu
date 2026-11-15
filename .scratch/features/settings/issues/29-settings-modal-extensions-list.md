# 29: Вкладка «Extensions» в Settings со списком extensions

**What to build:** В Modal «Settings» (тикет 32) появляется встроенная вкладка «Extensions», вторая после Global. На ней две группы:

- **Agentic** — Pi extensions, которые загружает Backend: файлы из папки extensions agent dir, пакеты из Pi settings и встроенные в Pi-Bolt (MCP, llama.cpp, Codemode, tool search).
- **Interface** — Extensions piu: встроенные и личные из `~/.piu/extensions` (или `$PIU_HOME/extensions`).

У каждой строки видно имя, откуда она (файл, пакет, встроенная, личная) и включена ли она. В этом тикете список только для чтения: переключение и удаление — тикет 30.

**Blocked by:** 32 (Modal «Settings» с вкладками и вкладка Global).

**Status:** ready-for-agent

## Критерии приёмки

- [ ] Вкладка «Extensions» встроенная, видна всегда и стоит после Global; добавлена тем же механизмом вкладок, что и в тикете 32.
- [ ] Группа Agentic показывает каждый Pi extension, который Backend нашёл бы при старте, и его состояние по Pi settings: выключенный файл (`-extensions/…`), пакет с `"extensions": []`, выключенный встроенный. Правила поиска и выключения взяты из документации установленного Backend (`settings.md`, `packages.md`, `extensions.md`), не по памяти.
- [ ] Группа Agentic читает тот же agent dir, что и Backend: `PI_CODING_AGENT_DIR`, если он задан, иначе каталог по умолчанию.
- [ ] Группа Interface показывает каждую найденную Extension; Extension с Pi extension внутри помечена (её Pi-часть не показывается отдельной строкой в Agentic).
- [ ] Построение списка не запускает Backend и не выполняет код Pi extensions.
- [ ] Список прокручивается, если не помещается.
- [ ] `GLOSSARY.md`: записать группы Agentic и Interface (термин Settings и «Pi settings» вводит тикет 32).

### Проверки

- [ ] Проверка через `startPiu` с временным agent dir, где есть включённый и выключенный файл Pi extension и пакет с `"extensions": []`: обе группы и состояния видны в кадре.
- [ ] Проверка с личной Extension во временном `PIU_HOME`: она в группе Interface с пометкой «личная».
- [ ] Тесты не читают настоящий agent dir и `~/.piu`.

## Notes

- Встроенные Pi extensions Pi-Bolt включаются и выключаются через `pi config`; как это записано в Pi settings, найти в документации установленного Pi-Bolt.
- Будущее: для Interface Extensions с Modules позже появится смена позиции прямо из этого окна (правка Placement). Вёрстку строки не делать так, чтобы это потом мешало.
