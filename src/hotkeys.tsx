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

type Loss = {
	readonly action: string;
	readonly shortcut: Shortcut;
};

type Mode =
	| { readonly kind: "idle" }
	| { readonly kind: "recording"; readonly first?: Chord }
	| {
			readonly kind: "confirm";
			readonly action: KeybindingAction;
			readonly shortcut: Shortcut;
			readonly personal: Keybindings;
			readonly moveToEnd: boolean;
			readonly losses: readonly Loss[];
	  }
	| { readonly kind: "error"; readonly message: string };

function uniqueShortcuts(shortcuts: readonly Shortcut[]) {
	const result: Shortcut[] = [];
	for (let at = shortcuts.length - 1; at >= 0; at--) {
		const shortcut = shortcuts[at];
		if (shortcut === undefined) continue;
		if (result.some((other) => sameShortcut(other, shortcut))) continue;
		result.unshift(shortcut);
	}
	return result;
}

function groupActions(actions: readonly KeybindingAction[]): Group[] {
	const bySource = new Map<
		string,
		{ name: string; actions: KeybindingAction[] }
	>();
	for (const action of actions) {
		const key =
			action.source.kind === "piu" ? "piu" : `extension:${action.source.name}`;
		const name = action.source.kind === "piu" ? "piu" : action.source.name;
		const group = bySource.get(key);
		if (group) group.actions.push(action);
		else bySource.set(key, { name, actions: [action] });
	}
	const ordered: { name: string; actions: readonly KeybindingAction[] }[] = [];
	const piu = bySource.get("piu");
	if (piu) ordered.push(piu);
	for (const [key, group] of bySource) {
		if (key !== "piu") ordered.push(group);
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
	const [mode, setMode] = createSignal<Mode>({ kind: "idle" });
	const rows = new Map<string, BoxRenderable>();
	let timer: ReturnType<Clock["setTimeout"]> | undefined;

	const actions = createMemo(() => options.keybindings().actions);
	const groups = createMemo(() => groupActions(actions()));
	const flat = () => groups().flatMap((group) => group.rows);
	const selected = () => flat()[index()]?.action;
	const confirmation = () => {
		const current = mode();
		return current.kind === "confirm" ? current : undefined;
	};
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
	const identify = (id: string | undefined) => {
		if (id === undefined) return "unknown action";
		const action = options
			.keybindings()
			.actions.find((entry) => entry.id === id);
		return action ? `${action.description} (${id})` : id;
	};

	const stopTimer = () => {
		if (timer !== undefined) options.clock.clearTimeout(timer);
		timer = undefined;
	};

	const cancel = () => {
		const current = mode();
		const busy = current.kind === "recording" || current.kind === "confirm";
		stopTimer();
		setMode({ kind: "idle" });
		return busy;
	};

	const fail = (message: string) => setMode({ kind: "error", message });

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

	const lossesFrom = (
		edited: string,
		before: Readonly<Record<string, readonly Shortcut[]>>,
		after: Readonly<Record<string, readonly Shortcut[]>>,
	) => {
		const losses: Loss[] = [];
		for (const action of options.keybindings().actions) {
			if (action.id === edited) continue;
			const previous = before[action.id] ?? [];
			const next = after[action.id] ?? [];
			for (const shortcut of previous) {
				if (next.some((kept) => sameShortcut(kept, shortcut))) continue;
				losses.push({ action: action.id, shortcut });
			}
		}
		return losses;
	};

	const finish = (shortcut: Shortcut) => {
		const action = selected();
		stopTimer();
		if (!action) {
			setMode({ kind: "idle" });
			return;
		}
		let candidate: Shortcut;
		try {
			candidate = validateShortcut(shortcut, action.id);
		} catch (error) {
			fail(errorMessage(error));
			return;
		}
		if (
			candidate.some((chord) => parseChord(shortcutSpec([chord])) === undefined)
		) {
			fail("This key cannot be written to Config; choose another");
			return;
		}
		if (
			action.id === "input.newline" &&
			sameShortcut(candidate, [shiftEnter])
		) {
			fail("Shift+Enter is already the fixed newline key");
			return;
		}
		const list = [
			...shortcutsOf(action).filter(
				(existing) => !sameShortcut(existing, candidate),
			),
			candidate,
		];
		const keptPersonal = withList(options.personal(), action.id, list);
		const kept = resolveKeybindings(
			options.keybindings().actions,
			keptPersonal,
		);
		const liveInKept = (kept.effective[action.id] ?? []).some((existing) =>
			sameShortcut(existing, candidate),
		);
		const personal = liveInKept
			? keptPersonal
			: assignLayer(options.personal(), action.id, list);
		const resolved = liveInKept
			? kept
			: resolveKeybindings(options.keybindings().actions, personal);
		const live = (resolved.effective[action.id] ?? []).some((existing) =>
			sameShortcut(existing, candidate),
		);
		if (!live) {
			fail("This shortcut cannot be assigned; choose another");
			return;
		}
		setKeyIndex(list.length - 1);
		const losses = lossesFrom(
			action.id,
			options.keybindings().effective,
			resolved.effective,
		);
		if (losses.length === 0) {
			setMode({ kind: "idle" });
			commit(action.id, list, personal, !liveInKept);
			return;
		}
		setMode({
			kind: "confirm",
			action,
			shortcut: candidate,
			personal,
			moveToEnd: !liveInKept,
			losses,
		});
	};

	const confirm = () => {
		const current = confirmation();
		if (!current) return;
		setMode({ kind: "idle" });
		const list = current.personal[current.action.id] ?? [];
		commit(current.action.id, list, current.personal, current.moveToEnd);
	};

	const record = (event: KeyEvent) => {
		const current = mode();
		if (current.kind !== "recording") return;
		const stroke = chordFromEvent(event);
		if (current.first) {
			stopTimer();
			finish([current.first, stroke]);
			return;
		}
		setMode({ kind: "recording", first: stroke });
		// why: Shift+Enter cannot start a sequence and is settled at once; every other first stroke waits for the sequence rule.
		if (sameShortcut([stroke], [shiftEnter])) {
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
		setMode({ kind: "recording" });
	};

	const move = (step: number) => {
		const length = flat().length;
		const next = Math.max(0, Math.min(length - 1, index() + step));
		if (next === index()) return;
		setIndex(next);
		setKeyIndex(0);
		setMode({ kind: "idle" });
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
		setMode({ kind: "idle" });
		commit(action.id, next, personal);
	};

	const clearAll = () => {
		const action = selected();
		if (!action) return;
		setKeyIndex(0);
		setMode({ kind: "idle" });
		commit(action.id, [], withList(options.personal(), action.id, []));
	};

	const resetAction = () => {
		const action = selected();
		if (!action) return;
		if (!options.keybindings().overridden.has(action.id)) return;
		setKeyIndex(0);
		setMode({ kind: "idle" });
		options.apply(resetLayer(options.personal(), action.id));
		save(action.id, undefined);
	};

	const onKeyDown = (event: KeyEvent, list: BoxRenderable) => {
		const current = mode();
		if (current.kind === "confirm") {
			event.preventDefault();
			if (event.name === "return" && !event.ctrl && !event.meta && !event.shift)
				confirm();
			return;
		}
		if (current.kind === "recording") {
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
			if (mode().kind === "recording" || mode().kind === "confirm") {
				cancel();
			}
			setIndex(at);
			setKeyIndex(0);
			setMode({ kind: "idle" });
			list.focus();
		};
		const shortcutLabel = (action: KeybindingAction, at: number) => {
			const chosen = index() === at;
			const parts = shortcutsOf(action).map((shortcut, position) => {
				const text = formatChord(shortcut);
				const shown = chosen && position === keyIndex() ? `[${text}]` : text;
				const winner = winnerOf(action.id, shortcut);
				return winner ? `${shown} → ${identify(winner)}` : shown;
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
													chosen()
														? theme.barMuted
														: lost(row.action)
															? theme.warning
															: theme.muted
												}
												flexShrink={1}
												maxWidth="55%"
												wrapMode="word"
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
		busy: () => mode().kind === "recording" || mode().kind === "confirm",
		cancel,
		reset() {
			cancel();
			setIndex(0);
			setKeyIndex(0);
		},
		status() {
			const current = mode();
			if (current.kind === "error") {
				return { lines: [current.message], tone: "error" as const };
			}
			if (current.kind !== "confirm") return undefined;
			return {
				lines: [
					`Assign ${formatChord(current.shortcut)} to ${identify(current.action.id)}?`,
					...current.losses.map(
						(loss) =>
							`It will take ${formatChord(loss.shortcut)} from ${identify(loss.action)}.`,
					),
				],
				tone: "warning" as const,
			};
		},
		hint() {
			const current = mode();
			if (current.kind === "confirm") {
				return "⏎ assign anyway   esc cancel";
			}
			if (current.kind === "recording") {
				return current.first
					? `${formatChord([current.first])} … press a second key or wait   esc cancel`
					: "press a shortcut   esc cancel";
			}
			return "↑/↓ action   ←/→ key   ⏎ add   ⌫ remove   c clear   r reset";
		},
	};
}
