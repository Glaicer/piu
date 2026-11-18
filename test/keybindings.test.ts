import { expect, test } from "bun:test";
import { parseBindingValue, parseKeybindings } from "../src/config.ts";
import {
	formatChord,
	type KeybindingAction,
	type ResolvedKeybindings,
	resolveKeybindings,
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
