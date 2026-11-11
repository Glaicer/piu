import { type KeyEvent, terminalNamedSingleStrokeKeys } from "@opentui/core";

export type Chord = {
	readonly name: string;
	readonly ctrl: boolean;
	readonly shift: boolean;
	readonly meta: boolean;
};

export type Keybindings = Readonly<Record<string, Chord>>;

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
	return {
		name,
		ctrl: held.has("ctrl"),
		shift: held.has("shift"),
		meta: held.has("meta"),
	};
}

// why: a terminal without the kitty protocol sends Ctrl+J as a bare line feed, which OpenTUI names "linefeed"; with the protocol it arrives as "j" plus ctrl.
export function matches(chord: Chord, event: KeyEvent) {
	const linefeed = event.name === "linefeed";
	return (
		chord.name === (linefeed ? "j" : event.name) &&
		chord.ctrl === (linefeed || event.ctrl) &&
		chord.shift === event.shift &&
		chord.meta === event.meta
	);
}
