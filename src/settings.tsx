import { type BoxRenderable, TextAttributes } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { createSignal, For, onMount, Show } from "solid-js";
import { type GlobalSettingChange, saveGlobalSetting } from "./config.ts";
import { contains } from "./focus.ts";
import { moduleModal } from "./modal.tsx";
import type { CommandContext, SettingsTab } from "./module.ts";
import { scrollIntoView, scrollKeys } from "./scroll.ts";
import { Tabs } from "./tabs.tsx";
import { type Theme, type ThemePreference, themeModes } from "./theme.ts";

function cycle(index: number, step: number, length: number) {
	return (index + step + length) % length;
}

export function createSettings(options: {
	path: string;
	mode: ThemePreference;
	animations: boolean;
	tabs: readonly SettingsTab[];
	notify(message: string): void;
}) {
	const [mode, setMode] = createSignal(options.mode);
	const [animations, setAnimations] = createSignal(options.animations);
	const save = (change: GlobalSettingChange) => {
		try {
			saveGlobalSetting(options.path, change);
		} catch (error) {
			options.notify(
				`Could not save Settings to config.json: ${String(error)}`,
			);
		}
	};
	const global: SettingsTab = {
		title: "Global",
		render: ({ theme }) => (
			<GlobalSettings
				theme={theme}
				rows={[
					{
						label: "Theme",
						value: mode,
						change: (step) => {
							const next =
								themeModes[
									cycle(themeModes.indexOf(mode()), step, themeModes.length)
								];
							if (next === undefined) return;
							setMode(next);
							save({ key: "theme.mode", value: next });
						},
					},
					{
						label: "Animations",
						value: () => (animations() ? "on" : "off"),
						change: () => {
							const next = !animations();
							setAnimations(next);
							save({ key: "animations", value: next });
						},
					},
				]}
			/>
		),
	};
	const tabs = [global, ...options.tabs];
	const keys = tabs.map((_, index) => index);
	return {
		mode,
		animations,
		open(context: CommandContext) {
			const [active, setActive] = createSignal(0);
			const current = () => tabs[active()] ?? global;
			let resetScroll: (() => void) | undefined;
			const select = (key: number) => {
				if (key === active()) return;
				resetScroll?.();
				setActive(key);
			};
			context.actions.openModal({
				...moduleModal(
					{
						id: "settings-tabs",
						title: "Settings",
						header: true,
						render: (moduleContext) => {
							resetScroll = moduleContext.resetScroll;
							return (
								<Tabs
									scrollable
									tabs={keys}
									active={active()}
									label={(key) => tabs[key]?.title ?? String(key)}
									theme={context.theme}
									onSelect={select}
								/>
							);
						},
					},
					{ width: "75%", height: "75%" },
					{
						id: "settings-body",
						render: () => (
							<Show when={current()} keyed>
								{(tab: SettingsTab) => <TabBody tab={tab} context={context} />}
							</Show>
						),
					},
					{
						id: "settings-hints",
						footer: true,
						render: () => (
							<text fg={context.theme.faint} wrapMode="none" truncate>
								{`${active() === 0 ? " ↑/↓ select   ⏎ change   " : " "}${tabs.length > 1 ? "ctrl+PgUp/PgDn tabs   " : ""}esc close`}
							</text>
						),
					},
				),
				onKey(event) {
					if (
						!event.ctrl ||
						event.meta ||
						event.shift ||
						(event.name !== "pageup" && event.name !== "pagedown")
					)
						return;
					const step = event.name === "pageup" ? -1 : 1;
					const next = cycle(active(), step, tabs.length);
					if (next === active()) return;
					event.preventDefault();
					select(next);
				},
			});
		},
	};
}

function TabBody(props: { tab: SettingsTab; context: CommandContext }) {
	const renderer = useRenderer();
	let body: BoxRenderable;
	onMount(() => {
		if (!contains(body, renderer.currentFocusedRenderable)) body.focus();
	});
	return (
		<box
			ref={(node: BoxRenderable) => {
				body = node;
			}}
			focusable
			onKeyDown={(event) => {
				if (scrollKeys(event, body)) event.preventDefault();
			}}
		>
			{props.tab.render(props.context)}
		</box>
	);
}

function GlobalSettings(props: {
	theme: Theme;
	rows: readonly {
		label: string;
		value(): string;
		change(step: number): void;
	}[];
}) {
	const { theme } = props;
	const [index, setIndex] = createSignal(0);
	let list: BoxRenderable;
	const rows: BoxRenderable[] = [];
	onMount(() => list.focus());
	return (
		<box
			ref={(node: BoxRenderable) => {
				list = node;
			}}
			focusable
			marginTop={1}
			onKeyDown={(event) => {
				if (event.meta || event.shift) return;
				if (!event.ctrl && (event.name === "up" || event.name === "down")) {
					const next = Math.max(
						0,
						Math.min(
							index() + (event.name === "up" ? -1 : 1),
							props.rows.length - 1,
						),
					);
					setIndex(next);
					scrollIntoView(rows[next]);
				} else if (
					!event.ctrl &&
					(event.name === "return" ||
						event.name === "left" ||
						event.name === "right")
				) {
					props.rows[index()]?.change(event.name === "left" ? -1 : 1);
				} else if (!scrollKeys(event, list)) return;
				event.preventDefault();
			}}
		>
			<For each={props.rows}>
				{(row, at) => {
					const selected = () => index() === at();
					return (
						<box
							ref={(node: BoxRenderable) => {
								rows[at()] = node;
							}}
							flexDirection="row"
							paddingX={1}
							backgroundColor={selected() ? theme.bar : undefined}
							onMouseDown={(event) => {
								event.preventDefault();
								setIndex(at());
								list.focus();
								row.change(1);
							}}
						>
							<text
								fg={selected() ? theme.barText : theme.text}
								attributes={selected() ? TextAttributes.BOLD : undefined}
								width={13}
							>
								{row.label}
							</text>
							<text fg={selected() ? theme.barMuted : theme.muted}>
								{row.value()}
							</text>
						</box>
					);
				}}
			</For>
		</box>
	);
}
