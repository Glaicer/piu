// Throwaway prototype: where should the two Advisor modes sit in a Models-style picker?
import { render, useKeyboard, useRenderer } from "@opentui/solid";
import { createMemo, createSignal, For, Show } from "solid-js";

const variants = ["Pinned rows", "Mode tab", "Sidebar"] as const;
const modes = ["Disable advisor", "Use current model"];
const models = [
	{ name: "GPT-6.2 Sol", provider: "commandcode", favorite: true },
	{
		name: "DeepSeek V4.1 Flash (latest)",
		provider: "commandcode",
		favorite: true,
	},
	{ name: "MiMo V2.6 Pro", provider: "commandcode", favorite: true },
	{ name: "Claude Opus 4.8", provider: "commandcode", favorite: false },
	{ name: "Claude Haiku 4.5", provider: "anthropic", favorite: false },
	{ name: "Gemini 3 Pro", provider: "google", favorite: false },
];
const surface = "#131313";
const muted = "#aaaaaa";
const accent = "#ff5148";

function AdvisorPrototype() {
	const renderer = useRenderer();
	const [variant, setVariant] = createSignal(
		Math.max(
			0,
			variants.findIndex((_, i) => process.argv[2] === String(i + 1)),
		),
	);
	const [tab, setTab] = createSignal("Favorites");
	const [query, setQuery] = createSignal("");
	const [index, setIndex] = createSignal(0);
	const [applied, setApplied] = createSignal(modes[0] ?? "");
	const tabs = () =>
		variant() === 1 ? ["Mode", "Favorites", "All"] : ["Favorites", "All"];
	const results = createMemo(() =>
		models.filter(
			(model) =>
				(tab() !== "Favorites" || model.favorite) &&
				`${model.name} ${model.provider}`
					.toLowerCase()
					.includes(query().trim().toLowerCase()),
		),
	);
	const rows = () => [
		...(variant() !== 1 || tab() === "Mode" ? modes : []),
		...(tab() === "Mode" ? [] : results().map((model) => model.name)),
	];
	const pick = (name: string) => setApplied(name);
	const changeTab = (next: string) => {
		setTab(next);
		setIndex(0);
	};
	useKeyboard((key) => {
		if (key.name === "escape") renderer.destroy();
		else if (key.name === "f2" || key.name === "f3") {
			key.preventDefault();
			setVariant(
				(value) => (value + (key.name === "f2" ? 2 : 1)) % variants.length,
			);
			changeTab("Favorites");
		} else if (key.name === "tab") {
			key.preventDefault();
			const available = tabs();
			changeTab(
				available[
					(available.indexOf(tab()) + (key.shift ? -1 : 1) + available.length) %
						available.length
				] ?? "Favorites",
			);
		} else if (key.name === "up" || key.name === "down") {
			key.preventDefault();
			const count = rows().length;
			if (count)
				setIndex(
					(value) => (value + count + (key.name === "up" ? -1 : 1)) % count,
				);
		} else if (key.name === "return") {
			key.preventDefault();
			const selected = rows()[index()];
			if (selected) pick(selected);
		}
	});

	const Row = (props: {
		name: string;
		provider?: string;
		favorite?: boolean;
	}) => (
		<box
			flexDirection="row"
			justifyContent="space-between"
			paddingX={1}
			backgroundColor={rows()[index()] === props.name ? "#272727" : surface}
			onMouseDown={() => {
				setIndex(rows().indexOf(props.name));
				pick(props.name);
			}}
		>
			<text truncate>
				{props.favorite ? "★ " : ""}
				{props.name}
				{applied() === props.name ? "  current" : ""}
			</text>
			<text fg={muted}>{props.provider ?? ""}</text>
		</box>
	);
	const ModeRows = () => (
		<For each={modes}>{(name) => <Row name={name} />}</For>
	);

	return (
		<box
			width="100%"
			height="100%"
			alignItems="center"
			justifyContent="center"
			backgroundColor="#1a1a1a"
		>
			<box width={72} maxWidth="98%" backgroundColor={surface}>
				<text wrapMode="none" truncate>
					{"━".repeat(72)}
				</text>
				<box paddingX={2} paddingBottom={1} gap={1}>
					<box flexDirection="row" justifyContent="space-between">
						<text>
							<b>Advisor</b>
						</text>
						<text fg={muted}>esc</text>
					</box>
					<Show when={variant() === 0}>
						<box>
							<ModeRows />
						</box>
					</Show>
					<box flexDirection="row" gap={2}>
						<For each={tabs()}>
							{(name) => (
								<box onMouseDown={() => changeTab(name)}>
									<text fg={tab() === name ? "#ffffff" : muted}>{name}</text>
									<text>{tab() === name ? "━".repeat(name.length) : ""}</text>
								</box>
							)}
						</For>
					</box>
					<Show
						when={tab() !== "Mode"}
						fallback={
							<box minHeight={7}>
								<ModeRows />
							</box>
						}
					>
						<box flexDirection="row" gap={1} minHeight={7}>
							<Show when={variant() === 2}>
								<box width={28} flexShrink={0}>
									<text fg={muted}>Advisor mode</text>
									<ModeRows />
								</box>
							</Show>
							<box flexGrow={1} flexShrink={1} gap={1}>
								<box flexDirection="row">
									<text fg={accent}>{"› "}</text>
									<input
										focused
										flexGrow={1}
										value={query()}
										placeholder="search models"
										cursorColor={accent}
										backgroundColor={surface}
										focusedBackgroundColor={surface}
										onInput={(value) => {
											setQuery(value);
											setIndex(Math.max(0, rows().length - results().length));
										}}
									/>
								</box>
								<box>
									<For
										each={results()}
										fallback={<text fg={muted}>No matching models</text>}
									>
										{(model) => <Row {...model} />}
									</For>
								</box>
							</box>
						</box>
					</Show>
					<text
						fg={muted}
						truncate
					>{`Current: ${applied()}   ·   tab sections   ↑/↓ select   ↵ apply`}</text>
				</box>
			</box>
			<box marginTop={1} paddingX={1} backgroundColor="#303030">
				<text
					truncate
				>{`F2 ‹   PROTOTYPE ${variant() + 1}/3 · ${variants[variant()]}   › F3`}</text>
			</box>
		</box>
	);
}

await render(() => <AdvisorPrototype />);
