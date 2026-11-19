import { type BoxRenderable, type Clock, TextAttributes } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { type Accessor, createSignal, For, onMount, Show } from "solid-js";
import { type GlobalSettingChange, saveGlobalSetting } from "./config.ts";
import { contains } from "./focus.ts";
import { createHotkeysTab } from "./hotkeys.tsx";
import type { Keybindings, ResolvedKeybindings } from "./keybindings.ts";
import { moduleModal } from "./modal.tsx";
import type {
	BuiltinSettingsTab,
	CommandContext,
	SettingsTab,
} from "./module.ts";
import { PickerLink } from "./picker.tsx";
import { scrollIntoView, scrollKeys } from "./scroll.ts";
import { openSystemShortcuts } from "./system-shortcuts.tsx";
import { Tabs } from "./tabs.tsx";
import { type Theme, type ThemePreference, themeModes } from "./theme.ts";

function cycle(index: number, step: number, length: number) {
	return (index + step + length) % length;
}

export function createSettings(options: {
	path: string;
	clock: Clock;
	mode: ThemePreference;
	animations: boolean;
	tabs: readonly SettingsTab[];
	keybindings: Accessor<ResolvedKeybindings>;
	personal: Accessor<Keybindings>;
	applyKeybindings(next: Keybindings): void;
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
	const hotkeys = createHotkeysTab({
		path: options.path,
		clock: options.clock,
		keybindings: options.keybindings,
		personal: options.personal,
		apply: options.applyKeybindings,
		notify: options.notify,
	});
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
	const tabs = [global, hotkeys.tab, ...options.tabs];
	const keys = tabs.map((_, index) => index);
	const status = (active: number) => {
		const tab = tabs[active] ?? global;
		return tab === hotkeys.tab ? hotkeys.status() : undefined;
	};
	const footer = (active: number) => {
		const tab = tabs[active] ?? global;
		if (tab === hotkeys.tab && hotkeys.busy()) return ` ${hotkeys.hint()}`;
		const parts: string[] = [];
		if (tab === global) parts.push("↑/↓ select   ⏎ change");
		else if (tab === hotkeys.tab) parts.push(hotkeys.hint());
		if (tabs.length > 1) parts.push("ctrl+PgUp/PgDn tabs");
		parts.push("esc close");
		return ` ${parts.join("   ")}`;
	};
	return {
		mode,
		animations,
		open(context: CommandContext, tab: BuiltinSettingsTab = "global") {
			const [active, setActive] = createSignal(
				tabs.indexOf(tab === "hotkeys" ? hotkeys.tab : global),
			);
			hotkeys.reset();
			const current = () => tabs[active()] ?? global;
			let resetScroll: (() => void) | undefined;
			const select = (key: number) => {
				if (key === active()) return;
				hotkeys.cancel();
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
								<box flexDirection="column">
									<Tabs
										scrollable
										tabs={keys}
										active={active()}
										label={(key) => tabs[key]?.title ?? String(key)}
										theme={context.theme}
										onSelect={select}
									/>
									<Show when={current() === hotkeys.tab && !hotkeys.busy()}>
										<box alignSelf="flex-start" paddingLeft={1}>
											<PickerLink
												context={context}
												label="System shortcuts [?]"
												onPress={() => openSystemShortcuts(context)}
											/>
										</box>
									</Show>
								</box>
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
							<box flexDirection="column" flexShrink={0} paddingTop={1}>
								<Show when={status(active())}>
									<text fg={context.theme.error} wrapMode="word">
										{` ${status(active()) ?? ""}`}
									</text>
								</Show>
								<text fg={context.theme.faint} wrapMode="none" truncate>
									{footer(active())}
								</text>
							</box>
						),
					},
				),
				onDismiss(reason) {
					if (reason === "escape" && hotkeys.cancel()) return false;
				},
				onKey(event) {
					if (hotkeys.busy()) return;
					if (
						current() === hotkeys.tab &&
						event.sequence === "?" &&
						!event.ctrl &&
						!event.meta
					) {
						event.preventDefault();
						openSystemShortcuts(context);
						return;
					}
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
