import { type KeyEvent, terminalNamedSingleStrokeKeys } from "@opentui/core";

export type Chord = {
	readonly name: string;
	readonly ctrl: boolean;
	readonly shift: boolean;
	readonly meta: boolean;
};

export type Shortcut = readonly [Chord] | readonly [Chord, Chord];

export type Keybindings = Readonly<Record<string, readonly Shortcut[]>>;

export type KeybindingSource =
	| { readonly kind: "piu" }
	| { readonly kind: "extension"; readonly name: string };

export type KeybindingAction = {
	readonly id: string;
	readonly description: string;
	readonly source: KeybindingSource;
	readonly defaults: readonly Shortcut[];
};

export type KeybindingAssignment = {
	readonly action: string;
	readonly shortcut: Shortcut;
};

export type KeybindingConflict = {
	readonly loser: KeybindingAssignment;
	readonly winner: KeybindingAssignment;
};

export type ResolvedKeybindings = {
	readonly actions: readonly KeybindingAction[];
	readonly requested: Keybindings;
	readonly effective: Keybindings;
	readonly conflicts: readonly KeybindingConflict[];
	readonly overridden: ReadonlySet<string>;
};

export const shiftEnter: Chord = {
	name: "return",
	ctrl: false,
	shift: true,
	meta: false,
};

export const commandAction = (name: string) => `command.${name}`;

const MODIFIERS = new Map<string, "ctrl" | "shift" | "meta">([
	["ctrl", "ctrl"],
	["shift", "shift"],
	["alt", "meta"],
	["meta", "meta"],
]);

export function isKeyName(name: string) {
	return [...name].length === 1 || terminalNamedSingleStrokeKeys.includes(name);
}

// why: a terminal without the kitty protocol sends Ctrl+J as a bare line feed, which OpenTUI names "linefeed"; both spellings must become one chord.
function canonicalStroke(
	name: string,
	ctrl: boolean,
	shift: boolean,
	meta: boolean,
): Chord {
	const linefeed = name === "linefeed";
	return {
		name: linefeed ? "j" : name.toLowerCase(),
		ctrl: linefeed || ctrl,
		shift,
		meta,
	};
}

export function parseChord(spec: string): Chord | undefined {
	const parts = spec.toLowerCase().split("+");
	const name = parts.pop();
	if (!name) return undefined;
	const held = new Set<"ctrl" | "shift" | "meta">();
	for (const part of parts) {
		const modifier = MODIFIERS.get(part);
		if (!modifier) return undefined;
		held.add(modifier);
	}
	return canonicalStroke(
		name,
		held.has("ctrl"),
		held.has("shift"),
		held.has("meta"),
	);
}

export function chordFromEvent(event: KeyEvent): Chord {
	return canonicalStroke(event.name, event.ctrl, event.shift, event.meta);
}

function sameStroke(a: Chord, b: Chord) {
	return (
		a.name === b.name &&
		a.ctrl === b.ctrl &&
		a.shift === b.shift &&
		a.meta === b.meta
	);
}

export function sameShortcut(a: Shortcut, b: Shortcut) {
	return (
		a.length === b.length &&
		a.every((chord, at) => {
			const other = b[at];
			return other !== undefined && sameStroke(chord, other);
		})
	);
}

function collides(a: Shortcut, b: Shortcut) {
	if (sameShortcut(a, b)) return true;
	const single = a.length === 1 ? a : b.length === 1 ? b : undefined;
	const pair = a.length === 2 ? a : b.length === 2 ? b : undefined;
	return single !== undefined && pair !== undefined
		? sameStroke(single[0], pair[0])
		: false;
}

const KEY_LABELS: Readonly<Record<string, string>> = {
	return: "⏎",
};

function formatStroke(chord: Chord) {
	return `${chord.ctrl ? "ctrl+" : ""}${chord.meta ? "alt+" : ""}${chord.shift ? "⇧" : ""}${KEY_LABELS[chord.name] ?? chord.name}`;
}

export function formatChord(shortcut: Shortcut) {
	return shortcut.map(formatStroke).join(" ");
}

export function shortcutSpec(shortcut: Shortcut) {
	return shortcut
		.map(
			(chord) =>
				`${chord.ctrl ? "ctrl+" : ""}${chord.meta ? "alt+" : ""}${chord.shift ? "shift+" : ""}${chord.name}`,
		)
		.join(" ");
}

export function matches(chord: Chord, event: KeyEvent) {
	return sameStroke(chord, chordFromEvent(event));
}

export function resolveKeybindings(
	actions: readonly KeybindingAction[],
	overrides: Keybindings,
): ResolvedKeybindings {
	const catalog = new Map(
		actions.map((action) => [action.id, action] as const),
	);
	const ownOverride = (id: string) =>
		Object.hasOwn(overrides, id) ? overrides[id] : undefined;
	const requested = Object.fromEntries(
		actions.map((action) => [
			action.id,
			ownOverride(action.id) ?? action.defaults,
		]),
	);
	const assignments: KeybindingAssignment[] = [];
	const assign = (action: string, shortcuts: readonly Shortcut[]) => {
		for (const shortcut of shortcuts) {
			assignments.push({ action, shortcut });
		}
	};
	// why: the catalog arrives ordered piu defaults first, then Extension defaults, so one pass keeps the layer order while a definition's owner stays independent of its layer.
	for (const action of actions) {
		if (!Object.hasOwn(overrides, action.id)) {
			assign(action.id, action.defaults);
		}
	}
	for (const [id, shortcuts] of Object.entries(overrides)) {
		if (catalog.has(id)) assign(id, shortcuts);
	}
	const ordered = assignments.filter(
		(assignment, at) =>
			assignments.findLastIndex(
				(other) =>
					other.action === assignment.action &&
					sameShortcut(other.shortcut, assignment.shortcut),
			) === at,
	);

	const accepted: (KeybindingAssignment | undefined)[] = new Array(
		ordered.length,
	);
	const conflicts: KeybindingConflict[] = [];
	for (let at = ordered.length - 1; at >= 0; at--) {
		const candidate = ordered[at];
		if (candidate === undefined) continue;
		let winnerAt = -1;
		for (let later = at + 1; later < ordered.length; later++) {
			const other = ordered[later];
			if (other === undefined) continue;
			if (accepted[later] === undefined) continue;
			if (!collides(candidate.shortcut, other.shortcut)) continue;
			if (winnerAt < 0 || later > winnerAt) winnerAt = later;
		}
		const winner = winnerAt < 0 ? undefined : ordered[winnerAt];
		if (winner === undefined) accepted[at] = candidate;
		else {
			conflicts.push({
				loser: candidate,
				winner,
			});
		}
	}
	conflicts.reverse();

	const effective: Record<string, readonly Shortcut[]> = {};
	for (const action of actions) {
		const kept: Shortcut[] = [];
		for (const shortcut of requested[action.id] ?? []) {
			if (kept.some((other) => sameShortcut(other, shortcut))) continue;
			const assigned = accepted.some(
				(assignment) =>
					assignment?.action === action.id &&
					sameShortcut(assignment.shortcut, shortcut),
			);
			if (assigned) kept.push(shortcut);
		}
		if (kept.length > 0) effective[action.id] = kept;
	}

	return {
		actions,
		requested,
		effective,
		conflicts,
		overridden: new Set(Object.keys(overrides).filter((id) => catalog.has(id))),
	};
}
