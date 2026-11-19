// Throwaway: which /resume layout makes similar sessions easiest to tell apart?
import {
	render,
	useKeyboard,
	useRenderer,
	useTerminalDimensions,
} from "@opentui/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { paintSheet } from "../../src/card.ts";
import { darkTheme as theme } from "../../src/theme.ts";

const sessions = [
	{
		title: "Как сейчас работает упоминание файла через `@`?",
		prompt:
			"Как сейчас работает упоминание файла через `@`?\nНа каком шаге список файлов закрывается?",
		messages: 80,
		updated: "Today 14:20",
		current: true,
	},
	{
		title: "Проверить цикл повторных команд",
		prompt:
			'<skill name="loop-me" location="/home/demo/.agents/skills/loop-me/SKILL.md">\nПроверь, что повторный запуск не теряет состояние.',
		messages: 9,
		updated: "Today 13:58",
	},
	{ title: "hi", prompt: "hi", messages: 8, updated: "Today 12:41" },
	{ title: "Say hi", prompt: "Say hi", messages: 5, updated: "Today 12:08" },
	{
		title: "Say hi",
		prompt: "Say hi in one line",
		messages: 2,
		updated: "Today 11:46",
	},
	{
		title: "Implement: новый экран настроек",
		prompt:
			'<skill name="implement" location="/home/demo/.agents/skills/implement/SKILL.md">\nДобавь вкладку с системными сочетаниями клавиш.',
		messages: 319,
		updated: "Yesterday",
	},
	{
		title: "Implement: навигация по панелям",
		prompt: "Проверь переходы между панелями с клавиатуры.",
		messages: 295,
		updated: "Yesterday",
	},
	{
		title: "Implement: обработка долгих задач",
		prompt: "Сохрани статус задачи после сворачивания панели.",
		messages: 304,
		updated: "Yesterday",
	},
	{
		title: "Какие issues не из папки closed сейчас закрыты?",
		prompt:
			"Какие issues не из папки closed сейчас закрыты?\nТолько те, что есть в текущей ветке.",
		messages: 22,
		updated: "Nov 16",
	},
	{
		title: "Какие issues не из папки closed сейчас закрыты?",
		prompt:
			"Какие issues не из папки closed сейчас закрыты?\nСравни список с main.",
		messages: 8,
		updated: "Nov 15",
	},
	{
		title: "Model picker: выбранная модель сбрасывается",
		prompt:
			"The bug: I select a model, e.g. deepseek-v4.1-flash; after I reopen the picker, it shows a different model.",
		messages: 3,
		updated: "Nov 14",
	},
];

const variants = ["A · Compact", "B · Cards", "C · Preview"] as const;
const firstVariant = variants.findIndex(
	(name) => name[0] === Bun.argv[2]?.toUpperCase(),
);

function ResumePrototype() {
	const renderer = useRenderer();
	const size = useTerminalDimensions();
	const [variant, setVariant] = createSignal(Math.max(0, firstVariant));
	const [query, setQuery] = createSignal("");
	const [index, setIndex] = createSignal(0);
	const [notice, setNotice] = createSignal("");
	const width = () => Math.min(100, size().width - 2);
	const height = () => Math.min(28, size().height - 4);
	const narrow = () => width() < 66;
	const split = () => variant() === 2 && !narrow();
	const visible = createMemo(() => {
		const words = query().toLowerCase().trim().split(/\s+/);
		return sessions.filter(({ title, prompt }) =>
			words.every((word) => `${title} ${prompt}`.toLowerCase().includes(word)),
		);
	});
	const selected = () => visible()[index()];
	const pageSize = () =>
		Math.max(
			1,
			Math.floor(
				(height() - (variant() === 2 && !split() ? 13 : 8)) /
					(variant() === 1 ? 3 : 1),
			),
		);
	const start = () => Math.floor(index() / pageSize()) * pageSize();
	const page = () => visible().slice(start(), start() + pageSize());

	const cycle = (step: number) => {
		setVariant(
			(current) => (current + step + variants.length) % variants.length,
		);
		setNotice("");
	};
	const select = (at: number) => {
		setIndex(Math.max(0, Math.min(at, visible().length - 1)));
		setNotice("");
	};
	const previewAction = () => {
		const session = selected();
		if (session) setNotice(`Would open: ${session.title}`);
	};
	useKeyboard((event) => {
		if (event.name === "escape") renderer.destroy();
		else if (event.meta && event.name === "left") cycle(-1);
		else if (event.meta && event.name === "right") cycle(1);
		else if (event.name === "up") select(index() - 1);
		else if (event.name === "down") select(index() + 1);
		else if (event.name === "pageup") select(index() - pageSize());
		else if (event.name === "pagedown") select(index() + pageSize());
		else if (event.name === "return") previewAction();
		else return;
		event.preventDefault();
	});

	return (
		<box
			width="100%"
			height="100%"
			alignItems="center"
			justifyContent="center"
			backgroundColor="#0c0c0c"
		>
			<box
				width={width()}
				height={height()}
				paddingTop={1}
				paddingX={2}
				paddingBottom={1}
				flexDirection="column"
				renderBefore={paintSheet(() => ({
					fill: theme.surface,
					rule: theme.text,
				}))}
			>
				<box height={1} flexDirection="row" justifyContent="space-between">
					<text fg={theme.text}>
						<strong>Resume session</strong>
					</text>
					<text fg={theme.muted}>
						{selected() ? `${index() + 1} / ${visible().length}` : "0 matches"}
					</text>
				</box>
				<box
					height={1}
					marginTop={1}
					flexDirection="row"
					backgroundColor={theme.raised}
				>
					<text fg={theme.secondary}>{" /  "}</text>
					<input
						focused
						flexGrow={1}
						backgroundColor={theme.raised}
						focusedBackgroundColor={theme.raised}
						focusedTextColor={theme.text}
						placeholder="Search sessions"
						onInput={(value) => {
							setQuery(value);
							select(0);
						}}
					/>
				</box>
				<box
					marginTop={1}
					flexGrow={1}
					minHeight={0}
					flexDirection={split() ? "row" : "column"}
					overflow="hidden"
				>
					<box
						width={split() ? "45%" : "100%"}
						flexGrow={1}
						flexDirection="column"
						overflow="hidden"
					>
						<Show
							when={page().length > 0}
							fallback={<text fg={theme.muted}>No matching sessions</text>}
						>
							<For each={page()}>
								{(session, row) => {
									const active = () => session === selected();
									const color = () => (active() ? theme.barText : theme.text);
									const muted = () => (active() ? theme.barMuted : theme.muted);
									return (
										<box
											flexDirection="column"
											height={variant() === 1 ? 2 : 1}
											marginBottom={variant() === 1 ? 1 : 0}
											paddingX={1}
											backgroundColor={
												active()
													? theme.bar
													: variant() === 1
														? theme.raised
														: theme.surface
											}
											onMouseDown={(event) => {
												event.preventDefault();
												select(start() + row());
											}}
										>
											<box height={1} flexDirection="row" gap={1}>
												<text fg={theme.secondary}>{active() ? "›" : " "}</text>
												<text
													fg={color()}
													flexGrow={1}
													flexShrink={1}
													minWidth={0}
													wrapMode="none"
													truncate
												>
													{session.title}
												</text>
												<Show when={session.current && variant() !== 2}>
													<text
														fg={theme.secondary}
														flexShrink={0}
														marginRight={variant() === 0 && !narrow() ? 3 : 0}
													>
														current
													</text>
												</Show>
												<Show when={variant() === 0}>
													<Show when={!narrow()}>
														<text fg={muted()} width={11}>
															{session.updated}
														</text>
													</Show>
												</Show>
											</box>
											<Show when={variant() === 1}>
												<text fg={muted()}>
													{`  ${session.updated}  ·  ${session.messages} messages`}
												</text>
											</Show>
										</box>
									);
								}}
							</For>
						</Show>
					</box>
					<Show when={variant() === 2 && selected()}>
						{(session: () => (typeof sessions)[number]) => (
							<box
								width={split() ? "54%" : "100%"}
								height={split() ? "100%" : 5}
								marginLeft={split() ? 1 : 0}
								flexShrink={0}
								paddingX={1}
								flexDirection="column"
								backgroundColor={theme.raised}
								overflow="hidden"
							>
								<text fg={theme.secondary}>
									<strong>FIRST PROMPT</strong>
								</text>
								<text
									fg={theme.muted}
									wrapMode="none"
									truncate
								>{`${session().updated}  ·  ${session().messages} messages${session().current ? "  ·  current" : ""}`}</text>
								<text fg={theme.text} marginTop={split() ? 1 : 0}>
									{session().prompt.replace(/^<skill[^>]*>\n?/, "")}
								</text>
							</box>
						)}
					</Show>
				</box>
				<text
					height={1}
					fg={notice() ? theme.secondary : theme.muted}
					wrapMode="none"
					truncate
				>
					{notice() || "↑↓ select   Enter open   Esc exit"}
				</text>
			</box>
			<box
				position="absolute"
				bottom={0}
				height={1}
				flexDirection="row"
				backgroundColor={theme.code}
			>
				<text fg={theme.secondary} onMouseDown={() => cycle(-1)}>
					{" ‹ "}
				</text>
				<text
					fg={theme.text}
				>{`Prototype: ${variants[variant()]} · Alt+←/→`}</text>
				<text fg={theme.secondary} onMouseDown={() => cycle(1)}>
					{" › "}
				</text>
			</box>
		</box>
	);
}

await render(() => <ResumePrototype />);
