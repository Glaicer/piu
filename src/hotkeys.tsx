import {
	type BoxRenderable,
	type Clock,
	type KeyEvent,
	TextAttributes,
} from "@opentui/core";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { saveKeybinding, validateShortcut } from "./config.ts";
import { sequenceTimeoutMs } from "./keybinding-router.ts";
import {
	type Chord,
	chordFromEvent,
	formatChord,
	type KeybindingAction,
	type Keybindings,
	parseChord,
	type ResolvedKeybindings,
	resolveKeybindings,
	type Shortcut,
	sameShortcut,
	shiftEnter,
	shortcutSpec,
} from "./keybindings.ts";
import type { CommandContext, SettingsTab } from "./module.ts";
import { scrollIntoView, scrollKeys } from "./scroll.ts";

type EnumeratedAction = {
	readonly action: KeybindingAction;
	readonly index: number;
};

type Group = {
	readonly name: string;
	readonly rows: readonly EnumeratedAction[];
};

type Pending = {
	readonly action: KeybindingAction;
	readonly shortcut: Shortcut;
	readonly list: readonly Shortcut[];
	readonly personal: Keybindings;
	readonly losers: readonly string[];
};

function uniqueShortcuts(shortcuts: readonly Shortcut[]) {
	const result: Shortcut[] = [];
	for (const shortcut of shortcuts) {
		if (result.some((other) => sameShortcut(other, shortcut))) continue;
		result.push(shortcut);
	}
	return result;
}

function groupActions(actions: readonly KeybindingAction[]): Group[] {
	const bySource = new Map<string, KeybindingAction[]>();
	for (const action of actions) {
		const name = action.source.kind === "piu" ? "piu" : action.source.name;
		const list = bySource.get(name);
		if (list) list.push(action);
		else bySource.set(name, [action]);
	}
	const ordered: { name: string; actions: readonly KeybindingAction[] }[] = [];
	const piu = bySource.get("piu");
	if (piu) ordered.push({ name: "piu", actions: piu });
	for (const [name, list] of bySource) {
		if (name !== "piu") ordered.push({ name, actions: list });
	}
	let index = 0;
	return ordered.map((group) => ({
		name: group.name,
		rows: group.actions.map((action) => ({ action, index: index++ })),
	}));
}

// why: the in-memory layer must mirror saveKeybinding's file order: a new assignment goes last, a removal keeps its place and a reset drops the key.
function assignLayer(
	personal: Keybindings,
	action: string,
	list: readonly Shortcut[],
): Keybindings {
	const next: Record<string, readonly Shortcut[]> = {};
	for (const [id, shortcuts] of Object.entries(personal)) {
		if (id !== action) next[id] = shortcuts;
	}
	next[action] = list;
	return next;
}

function withList(
	personal: Keybindings,
	action: string,
	list: readonly Shortcut[],
): Keybindings {
	return { ...personal, [action]: list };
}

function resetLayer(personal: Keybindings, action: string): Keybindings {
	const next = { ...personal };
	delete next[action];
	return next;
}

function errorMessage(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/^Invalid config: [^:]+: /, "");
}

type HotkeysOptions = {
	readonly path: string;
	readonly clock: Clock;
	readonly keybindings: Accessor<ResolvedKeybindings>;
	readonly personal: Accessor<Keybindings>;
	apply(next: Keybindings): void;
	notify(message: string): void;
};

export function createHotkeysTab(options: HotkeysOptions) {
	const [index, setIndex] = createSignal(0);
	const [keyIndex, setKeyIndex] = createSignal(0);
	const [recording, setRecording] = createSignal(false);
	const [firstStroke, setFirstStroke] = createSignal<Chord | undefined>();
	const [pending, setPending] = createSignal<Pending | undefined>();
	const [error, setError] = createSignal<string | undefined>();
	const rows = new Map<string, BoxRenderable>();
	let timer: ReturnType<Clock["setTimeout"]> | undefined;

	const actions = createMemo(() => options.keybindings().actions);
	const groups = createMemo(() => groupActions(actions()));
	const flat = () => groups().flatMap((group) => group.rows);
	const selected = () => flat()[index()]?.action;
	const shortcutsOf = (action: KeybindingAction) =>
		uniqueShortcuts(options.keybindings().requested[action.id] ?? []).filter(
			(shortcut) =>
				!(
					action.id === "input.newline" && sameShortcut(shortcut, [shiftEnter])
				),
		);
	const isChanged = (action: KeybindingAction) => {
		const current = uniqueShortcuts(
			options.keybindings().requested[action.id] ?? [],
		);
		const defaults = uniqueShortcuts(action.defaults);
		return (
			current.length !== defaults.length ||
			current.some((shortcut, at) => {
				const other = defaults[at];
				return other === undefined || !sameShortcut(shortcut, other);
			})
		);
	};
	const winnerOf = (action: string, shortcut: Shortcut) =>
		options
			.keybindings()
			.conflicts.find(
				(conflict) =>
					conflict.loser.action === action &&
					sameShortcut(conflict.loser.shortcut, shortcut),
			)?.winner.action;
	const describe = (id: string | undefined) =>
		options.keybindings().actions.find((action) => action.id === id)
			?.description ?? id;

	const stopTimer = () => {
		if (timer !== undefined) options.clock.clearTimeout(timer);
		timer = undefined;
	};

	const stopRecording = () => {
		stopTimer();
		setRecording(false);
		setFirstStroke(undefined);
	};

	const cancel = () => {
		const busy = recording() || pending() !== undefined;
		stopRecording();
		setPending(undefined);
		return busy;
	};

	const save = (
		action: string,
		list: readonly Shortcut[] | undefined,
		moveToEnd = false,
	) => {
		try {
			saveKeybinding(options.path, action, list, moveToEnd);
		} catch (error) {
			options.notify(`Could not save Hotkeys to config.json: ${String(error)}`);
		}
	};

	const commit = (
		action: string,
		list: readonly Shortcut[],
		personal: Keybindings,
		moveToEnd = false,
	) => {
		options.apply(personal);
		save(action, list, moveToEnd);
	};

	const finish = (shortcut: Shortcut) => {
		const action = selected();
		stopRecording();
		if (!action) return;
		let candidate: Shortcut;
		try {
			candidate = validateShortcut(shortcut, action.id);
		} catch (error) {
			setError(errorMessage(error));
			return;
		}
		if (
			candidate.some((chord) => parseChord(shortcutSpec([chord])) === undefined)
		) {
			setError("This key cannot be written to Config; choose another");
			return;
		}
		if (
			action.id === "input.newline" &&
			sameShortcut(candidate, [shiftEnter])
		) {
			setError("Shift+Enter is already the fixed newline key");
			return;
		}
		const list = [
			...shortcutsOf(action).filter(
				(existing) => !sameShortcut(existing, candidate),
			),
			candidate,
		];
		const personal = assignLayer(options.personal(), action.id, list);
		const resolved = resolveKeybindings(
			options.keybindings().actions,
			personal,
		);
		const losers = [
			...new Set(
				resolved.conflicts
					.filter(
						(conflict) =>
							conflict.winner.action === action.id &&
							conflict.loser.action !== action.id &&
							sameShortcut(conflict.winner.shortcut, candidate),
					)
					.map((conflict) => conflict.loser.action),
			),
		];
		setError(undefined);
		setKeyIndex(list.length - 1);
		if (losers.length === 0) {
			commit(action.id, list, personal, true);
			return;
		}
		setPending({
			action,
			shortcut: candidate,
			list,
			personal,
			losers: losers.map((id) => describe(id) ?? id),
		});
	};

	const confirm = () => {
		const current = pending();
		if (!current) return;
		setPending(undefined);
		commit(current.action.id, current.list, current.personal, true);
	};

	const record = (event: KeyEvent) => {
		const stroke = chordFromEvent(event);
		const first = firstStroke();
		if (first) {
			stopTimer();
			finish([first, stroke]);
			return;
		}
		setFirstStroke(stroke);
		const emergency =
			stroke.ctrl && !stroke.shift && !stroke.meta && stroke.name === "c";
		// why: Shift+Enter and Ctrl+C are settled after one stroke, because neither can start a sequence and waiting would only delay the answer.
		if (sameShortcut([stroke], [shiftEnter]) || emergency) {
			finish([stroke]);
			return;
		}
		timer = options.clock.setTimeout(() => {
			timer = undefined;
			finish([stroke]);
		}, sequenceTimeoutMs);
	};

	const beginRecording = () => {
		if (!selected()) return;
		setPending(undefined);
		setError(undefined);
		setRecording(true);
		setFirstStroke(undefined);
	};

	const move = (step: number) => {
		const length = flat().length;
		const next = Math.max(0, Math.min(length - 1, index() + step));
		if (next === index()) return;
		setIndex(next);
		setKeyIndex(0);
		setError(undefined);
	};

	const removeOne = () => {
		const action = selected();
		if (!action) return;
		const list = shortcutsOf(action);
		const at = Math.min(keyIndex(), list.length - 1);
		if (list.length === 0 || at < 0) return;
		const next = list.filter((_, position) => position !== at);
		const personal = withList(options.personal(), action.id, next);
		setKeyIndex(Math.max(0, Math.min(at, next.length - 1)));
		setError(undefined);
		commit(action.id, next, personal);
	};

	const clearAll = () => {
		const action = selected();
		if (!action) return;
		setKeyIndex(0);
		setError(undefined);
		commit(action.id, [], withList(options.personal(), action.id, []));
	};

	const resetAction = () => {
		const action = selected();
		if (!action) return;
		if (!options.keybindings().overridden.has(action.id)) return;
		setKeyIndex(0);
		setError(undefined);
		options.apply(resetLayer(options.personal(), action.id));
		save(action.id, undefined);
	};

	const onKeyDown = (event: KeyEvent, list: BoxRenderable) => {
		if (pending()) {
			event.preventDefault();
			if (event.name === "return" && !event.ctrl && !event.meta && !event.shift)
				confirm();
			return;
		}
		if (recording()) {
			event.preventDefault();
			record(event);
			return;
		}
		const plain = !event.ctrl && !event.meta && !event.shift;
		if (plain && event.name === "up") {
			event.preventDefault();
			move(-1);
		} else if (plain && event.name === "down") {
			event.preventDefault();
			move(1);
		} else if (plain && event.name === "home") {
			event.preventDefault();
			move(-flat().length);
		} else if (plain && event.name === "end") {
			event.preventDefault();
			move(flat().length);
		} else if (plain && event.name === "left") {
			event.preventDefault();
			setKeyIndex((at) => Math.max(0, at - 1));
		} else if (plain && event.name === "right") {
			event.preventDefault();
			const action = selected();
			const length = action ? shortcutsOf(action).length : 0;
			setKeyIndex((at) => Math.min(Math.max(0, length - 1), at + 1));
		} else if (plain && event.name === "return") {
			event.preventDefault();
			beginRecording();
		} else if (
			plain &&
			(event.name === "backspace" || event.name === "delete")
		) {
			event.preventDefault();
			removeOne();
		} else if (plain && event.name === "c") {
			event.preventDefault();
			clearAll();
		} else if (plain && event.name === "r") {
			event.preventDefault();
			resetAction();
		} else if (scrollKeys(event, list)) {
			event.preventDefault();
		}
	};

	createEffect(() => {
		const action = selected();
		const length = action ? shortcutsOf(action).length : 0;
		setKeyIndex((at) => Math.min(at, Math.max(0, length - 1)));
	});

	const HotkeysView = (props: { context: CommandContext }) => {
		const { theme } = props.context;
		let list: BoxRenderable;
		onMount(() => list.focus());
		onCleanup(cancel);
		createEffect(() => {
			const action = selected();
			if (!action) return;
			queueMicrotask(() => scrollIntoView(rows.get(action.id)));
		});
		const select = (at: number) => {
			if (recording() || pending()) cancel();
			setIndex(at);
			setKeyIndex(0);
			setError(undefined);
			list.focus();
		};
		const shortcutLabel = (action: KeybindingAction, at: number) => {
			const chosen = index() === at;
			const parts = shortcutsOf(action).map((shortcut, position) => {
				const text = formatChord(shortcut);
				const shown = chosen && position === keyIndex() ? `[${text}]` : text;
				const winner = winnerOf(action.id, shortcut);
				return winner ? `${shown} → ${describe(winner)}` : shown;
			});
			if (action.id === "input.newline") {
				parts.push(`${formatChord([shiftEnter])} fixed`);
			}
			return parts.length > 0 ? ` ${parts.join("   ")}` : "";
		};
		const lost = (action: KeybindingAction) =>
			shortcutsOf(action).some((shortcut) => winnerOf(action.id, shortcut));
		return (
			<box
				ref={(node: BoxRenderable) => {
					list = node;
				}}
				focusable
				marginTop={1}
				flexDirection="column"
				onKeyDown={(event) => onKeyDown(event, list)}
			>
				<For each={groups()}>
					{(group, at) => (
						<box flexDirection="column" marginTop={at() === 0 ? 0 : 1}>
							<text
								fg={theme.faint}
								attributes={TextAttributes.BOLD}
								paddingLeft={1}
							>
								{group.name}
							</text>
							<For each={group.rows}>
								{(row) => {
									const chosen = () => index() === row.index;
									return (
										<box
											ref={(node: BoxRenderable) => {
												rows.set(row.action.id, node);
											}}
											flexDirection="row"
											paddingX={1}
											backgroundColor={chosen() ? theme.bar : undefined}
											onMouseDown={(event) => {
												event.preventDefault();
												select(row.index);
											}}
										>
											<text
												fg={chosen() ? theme.barText : theme.text}
												attributes={chosen() ? TextAttributes.BOLD : undefined}
												flexGrow={1}
												wrapMode="none"
												truncate
											>
												{row.action.description}
											</text>
											<Show when={isChanged(row.action)}>
												<text
													fg={chosen() ? theme.barText : theme.secondary}
													flexShrink={0}
												>
													{" changed "}
												</text>
											</Show>
											<text
												fg={
													lost(row.action)
														? theme.warning
														: chosen()
															? theme.barMuted
															: theme.muted
												}
												flexShrink={1}
												wrapMode="none"
												truncate
											>
												{shortcutLabel(row.action, row.index)}
											</text>
										</box>
									);
								}}
							</For>
						</box>
					)}
				</For>
			</box>
		);
	};

	const tab: SettingsTab = {
		title: "Hotkeys",
		render: (context) => <HotkeysView context={context} />,
	};

	return {
		tab,
		busy: () => recording() || pending() !== undefined,
		cancel,
		status() {
			const message = error();
			if (message) return { text: message, tone: "error" as const };
			const current = pending();
			if (!current) return undefined;
			return {
				text: `Assign ${formatChord(current.shortcut)} to "${current.action.description}"? It will be taken from ${current.losers.join(", ")}.`,
				tone: "warning" as const,
			};
		},
		reset() {
			cancel();
			setError(undefined);
			setIndex(0);
			setKeyIndex(0);
		},
		hint() {
			if (pending()) return "⏎ assign anyway   esc cancel";
			if (recording()) {
				const first = firstStroke();
				return first
					? `${formatChord([first])} … press a second key or wait   esc cancel`
					: "press a shortcut   esc cancel";
			}
			return "↑/↓ action   ←/→ key   ⏎ add   ⌫ remove   c clear   r reset";
		},
	};
}
