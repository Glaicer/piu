# 24: Режимы агента как Extension

**What to build:** Extension `modes` с Pi extension внутри. Пользователь переключает режим агента (`default` и режимы из `.md` файлов в папке `modes` agent dir и, в доверенном проекте, в `.pi/modes`) клавишей Alt+M по кругу или командой `/mode`, которая показывает выбор, и `/mode <name>`. Текущий режим всегда виден в piu. Режим задаёт инструкции в системном промпте, набор tools, модель и уровень thinking, как сейчас делает личный Pi extension `modes`, и сохраняется в сессии.

Почти вся логика `modes` работает через RPC и так: правка системного промпта в `before_agent_start`, `setActiveTools`, `setModel`, `setThinkingLevel`, выбор через Dialog, статус. Не работает только шорткат: `registerShortcut` в RPC не доходит. Поэтому Pi extension переносится почти как есть, а piu добавляет клавишу и показ режима.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Критерии приёмки

- [ ] Pi extension Extension'а делает то же, что нынешний `modes`: формат файлов режима (frontmatter `model`, `thinking`, `tools`; тело — инструкции), порядок `default` + остальные по алфавиту, возврат к базовым модели, thinking и tools при выходе в `default`, восстановление режима из сессии при старте и предупреждение, если файл режима пропал.
- [ ] Alt+M переключает на следующий режим по кругу. Клавиша — keybinding в Config, её можно переназначить.
- [ ] `/mode` без аргументов открывает выбор режима с отметкой текущего; `/mode <name>` переключает сразу; неизвестное имя — Toast со списком режимов.
- [ ] Текущий режим виден в Module, который Extension кладёт в Placement по умолчанию; в `default` индикатор пустой. Индикатор рисует piu, а не ANSI-строка из `setStatus`.
- [ ] После перезапуска piu (Restart) режим сессии восстанавливается.
- [ ] Набор tools режима держится в течение всего хода, в том числе вместе с Pi extension `ask-user-question`, который правит `selectedTools` в `before_agent_start`.

### Проверки

- [ ] Проверка через `startPiu` с временным agent dir и двумя файлами режимов: Alt+M дважды, индикатор показывает каждый режим по очереди, затем снова `default`.
- [ ] Проверка: в режиме с `tools` faux model получает только эти tools в запросе после tool result.
- [ ] Проверка: `/mode <name>`, Restart, режим восстановлен.
- [ ] Ручная проверка `! bun scripts/pi-bolt-compat/run.ts` на настоящем agent dir; до неё тикет отмечает это как непроверенное. В agent dir с 2026-11-13 нет пакета rpiv, поэтому проверка скрипта, рассчитанная на него, ничего о rpiv не скажет.

## Notes

- Прочитать `docs/agents/pi-extensions.md` до начала: дубли имён tools на Pi-Bolt — ошибка запуска, и `setActiveTools()` может перебить чужой `before_agent_start`.
- Extension загружает свои `commands` и Pi extension, только если один из его Modules стоит в Placement: индикатор решает и это.
- Keybindings сейчас вызывают только Commands piu (`command.<name>`), а `/mode` — команда Pi extension. Как Alt+M доходит до Pi extension и не столкнутся ли `/mode` piu и Pi в `/`, решить в плане тикета.
- Исходник для справки: `modes.ts` и `modes/plan.md` в agent dir (`modes.ts` выключен в Pi settings).

## После приёмки (вручную)

- [ ] В `modes/plan.md` agent dir заменить `ask_user_question` на `ask_user` в списке tools: пакет rpiv удалён, в piu инструмент вопросов называется `ask_user`.
- [ ] Удалить `modes.ts` из agent dir и его строку `-extensions/modes.ts` из Pi settings; папку `modes/` оставить — её читает новый Pi extension.
