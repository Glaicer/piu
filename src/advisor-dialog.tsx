import type { BoxRenderable, InputRenderable, KeyEvent } from "@opentui/core";
import { createMemo, createSignal, For, Show } from "solid-js";
import { isThinkingLevel } from "./model-selection.ts";
import type { ModuleContext } from "./module.ts";
import type { ThinkingLevel } from "./pi-state.ts";
import { Tabs } from "./tabs.tsx";

export const advisorDialogTitle = "piu:advisor:v1";

type Option = {
	label: string;
	levels: ThinkingLevel[];
	model?: { provider: string; id: string; name: string };
};

export function parseAdvisorDialog(prefill: string | undefined) {
	try {
		const { options, current, effort } = JSON.parse(prefill ?? "");
		if (!Array.isArray(options) || typeof current !== "number") return;
		const parsed: Option[] = [];
		for (const option of options) {
			if (
				typeof option?.label !== "string" ||
				!Array.isArray(option.levels) ||
				!option.levels.every(isThinkingLevel)
			)
				return;
			const model = option.model;
			if (
				model !== undefined &&
				(typeof model?.name !== "string" ||
					typeof model.id !== "string" ||
					typeof model.provider !== "string")
			)
				return;
			parsed.push({ label: option.label, levels: option.levels, model });
		}
		if (!parsed[current]) return;
		return {
			options: parsed,
			current,
			effort: isThinkingLevel(effort) ? effort : undefined,
		};
	} catch {
		return;
	}
}

const tabs = ["Favorites", "All"] as const;
type Focus = "search" | "list" | "effort";

function indexOf<T>(items: readonly T[], item: T | undefined) {
	return item === undefined ? -1 : items.indexOf(item);
}

export function AdvisorDialog(props: {
	context: ModuleContext;
	data: NonNullable<ReturnType<typeof parseAdvisorDialog>>;
	apply(value: string): void;
}) {
	const { theme, modelFavorites } = props.context;
	const { options, current } = props.data;
	const modes = options.filter((option) => !option.model);
	const favorite = (option: Option) =>
		!!option.model && modelFavorites.has(option.model);
	const [tab, setTab] = createSignal<(typeof tabs)[number]>(
		options.some(favorite) &&
			(!options[current]?.model || favorite(options[current]))
			? "Favorites"
			: "All",
	);
	const [query, setQuery] = createSignal("");
	const [selected, select] = createSignal(options[current]);
	const [focus, setFocus] = createSignal<Focus>("search");
	const [drafts, setDrafts] = createSignal(new Map<Option, ThinkingLevel>());
	let search: InputRenderable;
	let surface: BoxRenderable;
	const matches = createMemo(() =>
		options.filter(
			(option) =>
				option.model &&
				(tab() === "All" || favorite(option)) &&
				`${option.label} ${option.model.name}`
					.toLowerCase()
					.includes(query().trim().toLowerCase()),
		),
	);
	const visible = () => [...modes, ...matches()];
	const start = () => Math.max(0, indexOf(matches(), selected()) - 6);
	const levels = () => selected()?.levels ?? [];
	const effort = () => {
		const option = selected();
		if (!option) return;
		const previous =
			option === options[current] ? props.data.effort : undefined;
		return (
			drafts().get(option) ??
			(previous && levels().includes(previous) ? previous : levels()[0])
		);
	};
	const adjust = (level: ThinkingLevel) => {
		const option = selected();
		if (option) setDrafts((values) => new Map(values).set(option, level));
	};
	const moveFocus = (next: Focus) => {
		setFocus(next);
		if (next === "search") search.focus();
		else surface.focus();
	};
	const changeTab = (next: (typeof tabs)[number]) => {
		setTab(next);
		if (indexOf(visible(), selected()) < 0) select(matches()[0] ?? modes[0]);
	};
	const onKey = (event: KeyEvent) => {
		const key = event.name;
		if (key === "up" || key === "down") {
			const rows = visible();
			const at = indexOf(rows, selected());
			select(
				rows[
					Math.min(rows.length - 1, Math.max(0, at + (key === "up" ? -1 : 1)))
				],
			);
			moveFocus("list");
		} else if (key === "tab") {
			const stops: Focus[] = levels().length
				? ["search", "list", "effort"]
				: ["search", "list"];
			moveFocus(
				stops[
					(stops.indexOf(focus()) + (event.shift ? -1 : 1) + stops.length) %
						stops.length
				] ?? "search",
			);
		} else if (key === "left" || key === "right") {
			if (focus() === "effort") {
				const next =
					levels()[indexOf(levels(), effort()) + (key === "left" ? -1 : 1)];
				if (next) adjust(next);
			} else changeTab(tab() === "Favorites" ? "All" : "Favorites");
		} else if (key === "return") {
			const index = indexOf(options, selected());
			if (index >= 0) props.apply(JSON.stringify({ index, effort: effort() }));
		} else if (key === "f" && focus() === "list") {
			const model = selected()?.model;
			if (model) modelFavorites.toggle(model);
			if (indexOf(visible(), selected()) < 0) select(matches()[0] ?? modes[0]);
		} else return;
		event.preventDefault();
	};
	const row = (option: Option) => (
		<box
			flexDirection="row"
			justifyContent="space-between"
			paddingX={1}
			backgroundColor={selected() === option ? theme.bar : undefined}
			onMouseDown={(event) => {
				event.preventDefault();
				select(option);
				moveFocus("list");
			}}
		>
			<text truncate fg={selected() === option ? theme.barText : theme.text}>
				{`${favorite(option) ? "★ " : ""}${option.model?.name ?? option.label}${option === options[current] ? "  current" : ""}`}
			</text>
			<text fg={selected() === option ? theme.barMuted : theme.muted}>
				{option.model?.provider ?? ""}
			</text>
		</box>
	);
	return (
		<box
			ref={(element) => {
				surface = element;
			}}
			focusable
			onKeyDown={onKey}
			flexDirection="column"
			gap={1}
		>
			<For each={modes}>{row}</For>
			<Tabs tabs={tabs} active={tab()} theme={theme} onSelect={changeTab} />
			<box
				flexDirection="row"
				onMouseDown={(event) => {
					event.preventDefault();
					moveFocus("search");
				}}
			>
				<text fg={theme.signal}>{" › "}</text>
				<input
					ref={(element) => {
						search = element;
					}}
					focused
					onKeyDown={onKey}
					flexGrow={1}
					placeholder="search models"
					textColor={theme.text}
					cursorColor={theme.signal}
					onInput={(value) => {
						setQuery(value);
						select(matches()[0] ?? modes[0]);
					}}
				/>
			</box>
			<box height={7} flexShrink={1} overflow="hidden">
				<For
					each={matches().slice(start(), start() + 7)}
					fallback={<text fg={theme.muted}>{" No matching models"}</text>}
				>
					{row}
				</For>
			</box>
			<Show when={levels().length}>
				<box paddingLeft={1}>
					<text fg={focus() === "effort" ? theme.signal : theme.muted}>
						Reasoning effort
					</text>
					<box flexDirection="row" overflow="hidden">
						<For each={levels()}>
							{(level, index) => (
								<box
									width={7}
									flexShrink={0}
									onMouseDown={(event) => {
										event.preventDefault();
										adjust(level);
										moveFocus("effort");
									}}
								>
									<text fg={level === effort() ? theme.signal : theme.muted}>
										{`${level === effort() ? "[x]" : "[ ]"}${index() < levels().length - 1 ? "────" : ""}`}
									</text>
									<text fg={level === effort() ? theme.text : theme.muted}>
										{level === "minimal"
											? "min"
											: level === "medium"
												? "med"
												: level}
									</text>
								</box>
							)}
						</For>
					</box>
				</box>
			</Show>
			<text
				truncate
				fg={theme.faint}
			>{` tab search/list${levels().length ? "/effort" : ""}   ${focus() === "effort" ? "←/→ effort" : "←/→ tabs   f favorite"}   ↵ apply`}</text>
		</box>
	);
}
