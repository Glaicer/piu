import { expect, test } from "bun:test";
import { KeyEvent } from "@opentui/core";
import { parseBindingValue, parseKeybindings } from "../src/config.ts";
import {
	chordFromEvent,
	formatChord,
	type KeybindingAction,
	matches,
	type ResolvedKeybindings,
	resolveKeybindings,
	shortcutSpec,
} from "../src/keybindings.ts";

function piu(id: string, defaults: string[]): KeybindingAction {
	return {
		id,
		description: id,
		source: { kind: "piu" },
		defaults: parseBindingValue(defaults, id),
	};
}

function extension(id: string, defaults: string[]): KeybindingAction {
	return {
		id,
		description: id,
		source: { kind: "extension", name: id.split(".")[0] ?? id },
		defaults: parseBindingValue(defaults, id),
	};
}

function shortcuts(bindings: ResolvedKeybindings["requested"]) {
	return Object.fromEntries(
		Object.entries(bindings).map(([id, list]) => [id, list.map(formatChord)]),
	);
}

function effective(bindings: ResolvedKeybindings) {
	return shortcuts(bindings.effective);
}

function conflicts(bindings: ResolvedKeybindings) {
	return bindings.conflicts.map(({ loser, winner }) => [
		loser.action,
		formatChord(loser.shortcut),
		winner.action,
		formatChord(winner.shortcut),
	]);
}

test("later layers replace conflicting shortcuts only", () => {
	const actions = [
		piu("piu", ["x", "y"]),
		extension("extension", ["x", "z"]),
		piu("other", []),
	];
	const resolved = resolveKeybindings(
		actions,
		parseKeybindings({ other: "z" }),
	);

	expect(shortcuts(resolved.requested)).toEqual({
		piu: ["x", "y"],
		extension: ["x", "z"],
		other: ["z"],
	});
	expect(effective(resolved)).toEqual({
		piu: ["y"],
		extension: ["x"],
		other: ["z"],
	});
	expect(conflicts(resolved)).toEqual([
		["piu", "x", "extension", "x"],
		["extension", "z", "other", "z"],
	]);
	expect(resolved.overridden).toEqual(new Set(["other"]));
});

test("personal key order decides the winner", () => {
	const actions = [piu("a", []), piu("b", [])];

	expect(
		effective(
			resolveKeybindings(actions, parseKeybindings({ a: "x", b: "x" })),
		),
	).toEqual({
		b: ["x"],
	});
	expect(
		effective(
			resolveKeybindings(actions, parseKeybindings({ b: "x", a: "x" })),
		),
	).toEqual({
		a: ["x"],
	});
});

test("Alt and Meta spell the same shortcut", () => {
	const resolved = resolveKeybindings(
		[piu("a", ["ALT+m"]), piu("b", ["meta+m"])],
		{},
	);

	expect(effective(resolved)).toEqual({ b: ["alt+m"] });
	expect(conflicts(resolved)).toEqual([["a", "alt+m", "b", "alt+m"]]);
});

test("a later single beats an earlier sequence", () => {
	const resolved = resolveKeybindings([piu("a", ["x m"]), piu("b", ["x"])], {});

	expect(effective(resolved)).toEqual({ b: ["x"] });
	expect(conflicts(resolved)).toEqual([["a", "x m", "b", "x"]]);
});

test("a later sequence beats an earlier single", () => {
	const resolved = resolveKeybindings([piu("a", ["x"]), piu("b", ["x m"])], {});

	expect(effective(resolved)).toEqual({ b: ["x m"] });
	expect(conflicts(resolved)).toEqual([["a", "x", "b", "x m"]]);
});

test("an inactive single does not block another sequence", () => {
	const resolved = resolveKeybindings(
		[piu("a", ["x m"]), piu("b", ["x"]), piu("c", ["x t"])],
		{},
	);

	expect(effective(resolved)).toEqual({ a: ["x m"], c: ["x t"] });
	expect(conflicts(resolved)).toEqual([["b", "x", "c", "x t"]]);
});

test("a repeated shortcut of one action resolves once without a conflict", () => {
	const resolved = resolveKeybindings(
		[piu("a", [])],
		parseKeybindings({ a: ["x", "x"] }),
	);

	expect(effective(resolved)).toEqual({ a: ["x"] });
	expect(resolved.conflicts).toEqual([]);
});

test("a later repeated shortcut wins before its own sequence", () => {
	const resolved = resolveKeybindings(
		[piu("a", [])],
		parseKeybindings({ a: ["g", "g m", "g"] }),
	);

	expect(effective(resolved)).toEqual({ a: ["g"] });
	expect(conflicts(resolved)).toEqual([["a", "g m", "a", "g"]]);
});

test("a duplicated shortcut of the loser reports one conflict", () => {
	const resolved = resolveKeybindings(
		[piu("model", []), piu("reasoning", [])],
		parseKeybindings({
			model: ["alt+m", "meta+m"],
			reasoning: "alt+m",
		}),
	);

	expect(effective(resolved)).toEqual({ reasoning: ["alt+m"] });
	expect(conflicts(resolved)).toEqual([
		["model", "alt+m", "reasoning", "alt+m"],
	]);
});

test("a shifted non-Latin letter keeps its Config spelling", () => {
	const [shortcut] = parseBindingValue("shift+я", "x");
	const chord = shortcut?.[0];
	if (!chord) throw new Error("expected a chord");
	const event = new KeyEvent({
		name: "Я",
		ctrl: false,
		meta: false,
		shift: true,
		option: false,
		sequence: "Я",
		number: false,
		raw: "Я",
		eventType: "press",
		source: "raw",
	});
	expect(chordFromEvent(event)).toEqual(chord);
	expect(matches(chord, event)).toBe(true);
	expect(shortcutSpec([chord])).toBe("shift+я");
});
