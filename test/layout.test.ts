import { expect, test } from "bun:test";
import { join } from "node:path";
import { startPiu } from "./harness.ts";
import { setFollower, setNote, setTakeover } from "./presence.ts";

const extensionsDir = join(import.meta.dir, "fixtures/extensions");
const none = { replies: [] };

function panel(id: string, size: unknown, extra: object = {}) {
	return { kind: "panel", id, direction: "column", size, ...extra };
}

function cornerColumns(line: string) {
	return [...line].flatMap((char, index) => (char === "┌" ? [index] : []));
}

function topBorder(frame: string) {
	return frame.split("\n")[0] ?? "";
}

function lineOf(frame: string, text: string) {
	return frame.split("\n").findIndex((line) => line.includes(text));
}

function cornerRows(frame: string, column: number) {
	return frame
		.split("\n")
		.flatMap((line, index) => ([...line][column] === "┌" ? [index] : []));
}

test("fixed, percentage, rest and minSize sizes divide the screen as written", async () => {
	await using piu = await startPiu({
		script: none,
		extensionsDir,
		width: 100,
		height: 30,
		config: {
			placement: { c: ["greeter.hello"], f: ["greeter.bye"] },
			modules: {
				"greeter.hello": { name: "a rather long name for a narrow Panel" },
			},
			layout: {
				kind: "container",
				id: "root",
				direction: "column",
				size: "rest",
				children: [
					{
						kind: "container",
						id: "top",
						direction: "row",
						size: "50%",
						children: [
							panel("a", 20),
							panel("b", "30%"),
							panel("c", "rest"),
							panel("d", "rest", { minSize: 30 }),
						],
					},
					panel("e", 4),
					panel("f", "rest"),
				],
			},
		},
	});

	const frame = await piu.waitForFrame((f) => f.includes("Bye"));
	expect(cornerColumns(topBorder(frame))).toEqual([0, 20, 50, 70]);
	expect(cornerRows(frame, 0)).toEqual([0, 15, 19]);

	piu.resize(200, 30);
	const wide = await piu.waitForFrame(
		(f) => topBorder(f).trimEnd().length === 200,
	);
	expect(cornerColumns(topBorder(wide))).toEqual([0, 20, 80, 140]);
});

test("the default second column is absent below 120 columns and returns on resize", async () => {
	await using piu = await startPiu({ script: none, width: 119 });

	const narrow = await piu.waitForFrame((f) => f.includes("┌"));
	expect(topBorder(narrow)).not.toContain("┐┌");
	expect(topBorder(narrow).trimEnd()).toHaveLength(119);

	piu.resize(120, 30);
	await piu.waitForFrame((f) => topBorder(f).includes("┐┌"));

	piu.resize(119, 30);
	await piu.waitForFrame((f) => !topBorder(f).includes("┐┌"));
});

test("a row Panel shows its Modules side by side", async () => {
	await using piu = await startPiu({
		script: none,
		extensionsDir,
		config: {
			layout: panel("strip", "rest", { direction: "row" }),
			placement: { strip: ["greeter.hello", "greeter.bye"] },
			modules: { "greeter.hello": { name: "Ada" } },
		},
	});

	const frame = await piu.waitForFrame((f) => f.includes("Bye"));
	expect(lineOf(frame, "Bye")).toBe(lineOf(frame, "Hello Ada"));
});

test("the wheel scrolls the Panel under the pointer, not the focused one", async () => {
	await using piu = await startPiu({
		script: none,
		extensionsDir,
		width: 100,
		config: {
			layout: {
				kind: "container",
				id: "root",
				direction: "column",
				size: "rest",
				children: [
					{
						kind: "container",
						id: "columns",
						direction: "row",
						size: "rest",
						children: [panel("left", "50%"), panel("right", "rest")],
					},
					panel("input", 3),
				],
			},
			placement: {
				left: ["scroll.alpha"],
				right: ["scroll.beta"],
				input: ["input.prompt"],
			},
		},
	});
	await piu.waitForFrame(
		(f) => f.includes("alpha 01") && f.includes("beta 01"),
	);

	for (let tick = 0; tick < 5; tick++)
		await piu.mockMouse.scroll(10, 10, "down");
	const afterLeft = await piu.waitForFrame((f) => !f.includes("alpha 01"));
	expect(afterLeft).toContain("beta 01");

	for (let tick = 0; tick < 5; tick++)
		await piu.mockMouse.scroll(60, 10, "down");
	const afterRight = await piu.waitForFrame((f) => !f.includes("beta 01"));
	expect(afterRight).not.toContain("alpha 01");

	await piu.mockInput.typeText("still focused");
	await piu.waitForFrame((f) => f.includes("still focused"));
});

test("a hidden Module takes no rows and a shown one takes its own", async () => {
	setNote("hidden");
	await using piu = await startPiu({
		script: none,
		extensionsDir,
		config: {
			layout: panel("stack", "rest"),
			placement: { stack: ["greeter.hello", "presence.note", "greeter.bye"] },
			modules: { "greeter.hello": { name: "Ada" } },
		},
	});

	const hidden = await piu.waitForFrame((f) => f.includes("Bye"));
	expect(hidden).not.toContain("Note");
	expect(lineOf(hidden, "Bye")).toBe(lineOf(hidden, "Hello Ada") + 1);

	setNote("shown");
	const shown = await piu.waitForFrame((f) => f.includes("Note"));
	expect(lineOf(shown, "Bye")).toBe(lineOf(shown, "Hello Ada") + 2);
});

test("an exclusive Module hides its siblings until it stops claiming the Panel", async () => {
	setTakeover("hidden");
	await using piu = await startPiu({
		script: none,
		extensionsDir,
		config: {
			layout: panel("stack", "rest"),
			placement: {
				stack: ["greeter.hello", "presence.takeover", "greeter.bye"],
			},
			modules: { "greeter.hello": { name: "Ada" } },
		},
	});
	await piu.waitForFrame((f) => f.includes("Hello Ada") && f.includes("Bye"));

	setTakeover("exclusive");
	const claimed = await piu.waitForFrame((f) => f.includes("Takeover"));
	expect(claimed).not.toContain("Hello Ada");
	expect(claimed).not.toContain("Bye");

	setTakeover("hidden");
	const released = await piu.waitForFrame((f) => !f.includes("Takeover"));
	expect(released).toContain("Hello Ada");
	expect(released).toContain("Bye");
});

test("the default input area has a row Panel for status Modules below the input", async () => {
	await using piu = await startPiu({
		script: none,
		extensionsDir,
		config: {
			placement: { status: ["greeter.hello", "greeter.bye"] },
			modules: { "greeter.hello": { name: "Ada" } },
		},
	});

	await piu.mockInput.typeText("typed");
	const frame = await piu.waitForFrame(
		(f) => f.includes("typed") && f.includes("Bye"),
	);
	expect(lineOf(frame, "Bye")).toBe(lineOf(frame, "Hello Ada"));
	expect(lineOf(frame, "Bye")).toBeGreaterThan(lineOf(frame, "typed"));
});

test("a Panel follows output only when a Module that follows output is visible in it", async () => {
	const start = (presence: "hidden" | "shown") => {
		setFollower(presence);
		return startPiu({
			script: none,
			extensionsDir,
			config: {
				layout: panel("stack", "rest"),
				placement: { stack: ["scroll.alpha", "presence.follower"] },
			},
		});
	};
	{
		await using hidden = await start("hidden");
		const frame = await hidden.waitForFrame((f) => f.includes("alpha 01"));
		expect(frame).not.toContain("alpha 40");
	}
	await using shown = await start("shown");
	const frame = await shown.waitForFrame((f) => f.includes("Follower"));
	expect(frame).toContain("alpha 40");
	expect(frame).not.toContain("alpha 01");
});
