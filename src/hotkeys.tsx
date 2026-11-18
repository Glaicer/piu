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
	Index,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	readKeybindingEdit,
	saveKeybinding,
	validateShortcut,
} from "./config.ts";
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
import { scrollBoxOf, scrollIntoView, scrollKeys } from "./scroll.ts";

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

type PersonalSnapshot =
	| ({ readonly kind: "file" } & ReturnType<typeof readKeybindingEdit>)
	| {
			readonly kind: "memory";
			readonly personal: Keybindings;
			readonly error: unknown;
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
			readonly snapshot: PersonalSnapshot;
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

function assignLayer(
	personal: Keybindings,
	action: string,
	list: readonly Shortcut[],
): Keybindings {
	return { ...resetLayer(personal, action), [action]: list };
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
	const [reviewed, setReviewed] = createSignal(false);
	let timer: ReturnType<Clock["setTimeout"]> | undefined;

	const actions = createMemo(() => options.keybindings().actions);
	const groups = createMemo(() => groupActions(actions()));
	const flat = () => groups().flatMap((group) => group.rows);
	const selected = () => flat()[index()]?.action;
	const confirmation = () => {
		const current = mode();
		return current.kind === "confirm" ? current : undefined;
	};
	const busy = () => {
		const { kind } = mode();
		return kind === "recording" || kind === "confirm";
	};
	const shortcutsOf = (
		action: KeybindingAction,
		resolved = options.keybindings(),
	) =>
		uniqueShortcuts(resolved.requested[action.id] ?? []).filter(
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
		const wasBusy = busy();
		stopTimer();
		setMode({ kind: "idle" });
		return wasBusy;
	};

	const fail = (message: string) => setMode({ kind: "error", message });

	const commit = (
		action: string,
		personal: Keybindings,
		moveToEnd = false,
		snapshot?: PersonalSnapshot,
	) => {
		options.apply(personal);
		const list = Object.hasOwn(personal, action) ? personal[action] : undefined;
		try {
			if (snapshot?.kind === "memory") throw snapshot.error;
			if (snapshot?.kind === "file" && list) {
				snapshot.save(action, list, moveToEnd);
			} else saveKeybinding(options.path, action, list, moveToEnd);
		} catch (error) {
			options.notify(`Could not save Hotkeys to config.json: ${String(error)}`);
		}
	};

	const readPersonal = (): PersonalSnapshot => {
		try {
			return { kind: "file", ...readKeybindingEdit(options.path) };
		} catch (error) {
			return { kind: "memory", personal: options.personal(), error };
		}
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

	const finish = (shortcut: Shortcut, snapshot?: PersonalSnapshot) => {
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
		const base = snapshot ?? readPersonal();
		const before = resolveKeybindings(actions(), base.personal);
		const list = [
			...shortcutsOf(action, before).filter(
				(existing) => !sameShortcut(existing, candidate),
			),
			candidate,
		];
		const keptPersonal = withList(base.personal, action.id, list);
		const kept = resolveKeybindings(
			options.keybindings().actions,
			keptPersonal,
		);
		const liveInKept = (kept.effective[action.id] ?? []).some((existing) =>
			sameShortcut(existing, candidate),
		);
		const personal = liveInKept
			? keptPersonal
			: assignLayer(base.personal, action.id, list);
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
		const losses = lossesFrom(action.id, before.effective, resolved.effective);
		if (losses.length === 0) {
			setMode({ kind: "idle" });
			setKeyIndex(list.length - 1);
			commit(action.id, personal, !liveInKept, base);
			return;
		}
		setReviewed(false);
		setMode({
			kind: "confirm",
			action,
			shortcut: candidate,
			personal,
			moveToEnd: !liveInKept,
			losses,
			snapshot: base,
		});
	};

	const confirm = () => {
		const current = confirmation();
		if (!current) return;
		const fresh = readPersonal();
		if (
			fresh.kind !== current.snapshot.kind ||
			JSON.stringify(fresh.personal) !==
				JSON.stringify(current.snapshot.personal)
		) {
			finish(current.shortcut, fresh);
			return;
		}
		setMode({ kind: "idle" });
		setKeyIndex((current.personal[current.action.id]?.length ?? 1) - 1);
		commit(current.action.id, current.personal, current.moveToEnd, fresh);
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
		commit(action.id, personal);
	};

	const clearAll = () => {
		const action = selected();
		if (!action) return;
		setKeyIndex(0);
		setMode({ kind: "idle" });
		commit(action.id, withList(options.personal(), action.id, []));
	};

	const resetAction = () => {
		const action = selected();
		if (!action) return;
		if (!options.keybindings().overridden.has(action.id)) return;
		setKeyIndex(0);
		setMode({ kind: "idle" });
		commit(action.id, resetLayer(options.personal(), action.id));
	};

	const onKeyDown = (event: KeyEvent, list: BoxRenderable) => {
		const current = mode();
		const plain = !event.ctrl && !event.meta && !event.shift;
		if (current.kind === "confirm") {
			event.preventDefault();
			if (plain && event.name === "return") {
				if (reviewed()) confirm();
			} else if (plain && (event.name === "home" || event.name === "end")) {
				scrollBoxOf(list)?.scrollTo(event.name === "home" ? 0 : Infinity);
			} else scrollKeys(event, list);
			return;
		}
		if (current.kind === "recording") {
			event.preventDefault();
			record(event);
			return;
		}
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

	const Review = (props: {
		assignment: NonNullable<ReturnType<typeof confirmation>>;
		context: CommandContext;
	}) => {
		let content: BoxRenderable;
		onMount(() => {
			const scroll = scrollBoxOf(content);
			if (!scroll) return;
			const update = () => {
				if (confirmation() !== props.assignment) return;
				const { height } = scroll.viewport;
				setReviewed(
					height > 0 && scroll.scrollTop + height >= scroll.scrollHeight,
				);
			};
			scroll.scrollTo(0);
			scroll.afterLayout(update);
			scroll.verticalScrollBar.on("change", update);
			scroll.viewport.on("resize", update);
			scroll.content.on("resize", update);
			onCleanup(() => {
				scroll.verticalScrollBar.off("change", update);
				scroll.viewport.off("resize", update);
				scroll.content.off("resize", update);
			});
		});
		return (
			<box
				ref={(node) => {
					content = node;
				}}
				paddingX={1}
				flexDirection="column"
			>
				<text fg={props.context.theme.warning}>
					{`Assign ${formatChord(props.assignment.shortcut)} to ${identify(props.assignment.action.id)}?`}
				</text>
				<For each={props.assignment.losses}>
					{(loss) => (
						<text fg={props.context.theme.warning}>
							{`It will take ${formatChord(loss.shortcut)} from ${identify(loss.action)}.`}
						</text>
					)}
				</For>
			</box>
		);
	};

	const HotkeysView = (props: { context: CommandContext }) => {
		const { theme } = props.context;
		let list: BoxRenderable;
		const rows = new Map<string, BoxRenderable>();
		const shortcutRows = new Map<string, Map<number, BoxRenderable>>();
		onMount(() => list.focus());
		onCleanup(cancel);
		createEffect(() => {
			if (confirmation()) return;
			const action = selected();
			if (!action) return;
			const at = keyIndex();
			queueMicrotask(() =>
				scrollIntoView(
					shortcutRows.get(action.id)?.get(at) ?? rows.get(action.id),
				),
			);
		});
		const select = (at: number) => {
			cancel();
			setIndex(at);
			setKeyIndex(0);
			list.focus();
		};
		const ActionRow = (row: EnumeratedAction) => {
			const chosen = () => index() === row.index;
			const nodes = new Map<number, BoxRenderable>();
			shortcutRows.set(row.action.id, nodes);
			onCleanup(() => {
				shortcutRows.delete(row.action.id);
				rows.delete(row.action.id);
			});
			return (
				<box
					ref={(node) => {
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
					<box
						flexDirection="row"
						flexWrap="wrap"
						alignItems="flex-start"
						columnGap={3}
						flexShrink={1}
						maxWidth="55%"
					>
						<Index each={shortcutsOf(row.action)}>
							{(shortcut, at) => {
								const winner = () => winnerOf(row.action.id, shortcut());
								const label = () => {
									const text = formatChord(shortcut());
									const shown =
										chosen() && at === keyIndex() ? `[${text}]` : text;
									const id = winner();
									return id ? `${shown} → ${identify(id)}` : shown;
								};
								onCleanup(() => nodes.delete(at));
								return (
									<box
										ref={(node) => {
											nodes.set(at, node);
										}}
										maxWidth="100%"
									>
										<text
											fg={
												chosen()
													? theme.barMuted
													: winner()
														? theme.warning
														: theme.muted
											}
										>
											{label()}
										</text>
									</box>
								);
							}}
						</Index>
						<Show when={row.action.id === "input.newline"}>
							<text fg={chosen() ? theme.barMuted : theme.muted}>
								{`${formatChord([shiftEnter])} fixed`}
							</text>
						</Show>
					</box>
				</box>
			);
		};
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
				<Show
					when={confirmation()}
					keyed
					fallback={
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
									<For each={group.rows}>{ActionRow}</For>
								</box>
							)}
						</For>
					}
				>
					{(assignment: NonNullable<ReturnType<typeof confirmation>>) => (
						<Review assignment={assignment} context={props.context} />
					)}
				</Show>
			</box>
		);
	};

	const tab: SettingsTab = {
		title: "Hotkeys",
		render: (context) => <HotkeysView context={context} />,
	};

	return {
		tab,
		busy,
		cancel,
		reset() {
			cancel();
			setIndex(0);
			setKeyIndex(0);
		},
		status() {
			const current = mode();
			return current.kind === "error" ? current.message : undefined;
		},
		hint() {
			const current = mode();
			if (current.kind === "confirm") {
				return reviewed()
					? "⏎ assign anyway   esc cancel"
					: "↑/↓ scroll to review   esc cancel";
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
