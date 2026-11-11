import { expect, test } from "bun:test";
import { join } from "node:path";
import { ManualClock } from "@opentui/core/testing";
import { type FauxScript, startPiu } from "./harness.ts";
import { hooks } from "./hooks.ts";

const none: FauxScript = { replies: [] };

function rowOf(frame: string, text: string) {
	return frame.split("\n").findLastIndex((line) => line.includes(text));
}

async function start(options: {
	animations: boolean;
	script?: FauxScript;
	config?: object;
	extensions?: string;
}) {
	const clock = new ManualClock();
	const piu = await startPiu({
		script: options.script ?? none,
		clock,
		extensions: options.extensions,
		config: {
			animations: options.animations,
			placement: { status: ["model.current", "reasoning.level"] },
			...options.config,
		},
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));
	const frame = async (ms = 0) => {
		clock.advance(ms);
		await piu.renderOnce();
		return piu.captureCharFrame();
	};
	return { piu, frame, [Symbol.asyncDispose]: () => piu.dispose() };
}

async function clickText(
	piu: Awaited<ReturnType<typeof start>>["piu"],
	text: string,
) {
	const rows = piu.captureCharFrame().split("\n");
	const y = rows.findLastIndex((line) => line.includes(text));
	await piu.mockMouse.click((rows[y] ?? "").indexOf(text) + 1, y);
}

test("an opening Modal is in its final place on the first frame with animations on", async () => {
	await using app = await start({ animations: true });
	await clickText(app.piu, "faux-1");

	const first = rowOf(await app.frame(), "faux-2");
	const final = rowOf(await app.frame(1000), "faux-2");
	expect(first).toBeGreaterThanOrEqual(0);
	expect(first).toBe(final);
});

test("with animations off an opening Modal is in its final place on the first frame", async () => {
	await using animated = await start({ animations: true });
	await clickText(animated.piu, "faux-1");
	await animated.frame();
	const settled = rowOf(await animated.frame(1000), "faux-2");

	await using app = await start({ animations: false });
	await clickText(app.piu, "faux-1");
	expect(rowOf(await app.frame(), "faux-2")).toBe(settled);
});

test("a dismissed Modal is gone on the first frame with animations on", async () => {
	await using app = await start({ animations: true });
	await clickText(app.piu, "faux-1");
	await app.frame();
	await app.piu.mockMouse.click(1, 1);
	expect(rowOf(await app.frame(), "faux-2")).toBe(-1);
});

test("with animations off a dismissed Modal is gone on the first frame", async () => {
	await using app = await start({ animations: false });
	await clickText(app.piu, "faux-1");
	await app.frame();
	await app.piu.mockMouse.click(1, 1);
	expect(rowOf(await app.frame(), "faux-2")).toBe(-1);
});

for (const animations of [true, false]) {
	test(`Esc immediately closes a Modal and restores prompt input (animations ${animations})`, async () => {
		await using app = await start({ animations });
		await clickText(app.piu, "faux-1");
		await app.frame();
		app.piu.mockInput.pressEscape();
		const closed = await app.frame();
		expect([...closed.matchAll(/┌─ ([\w-]+) /g)].map((m) => m[1])).toEqual([
			"input",
		]);
		await app.piu.mockInput.typeText("draft");
		const frame = await app.frame();
		expect(rowOf(frame, "faux-2")).toBe(-1);
		expect(frame).toContain("draft");
	});

	test(`selecting a model immediately closes its Modal (animations ${animations})`, async () => {
		await using app = await start({ animations });
		await clickText(app.piu, "faux-1");
		await app.frame();
		await clickText(app.piu, "faux-2");
		const closed = await app.frame();
		expect([...closed.matchAll(/┌─ ([\w-]+) /g)].map((m) => m[1])).toEqual([
			"input",
		]);
		expect(closed).not.toContain("faux-1");
		await app.piu.mockInput.typeText("draft");
		const frame = await app.frame();
		expect(frame).toContain("draft");
	});

	test(`programmatically closing a Modal removes it on the first frame (animations ${animations})`, async () => {
		await using app = await start({
			animations,
			extensions: join(import.meta.dir, "fixtures/extensions"),
			config: { placement: { status: ["model.current", "probe.capture"] } },
		});
		const close = hooks.probe.actions?.openModal({
			slot: {
				kind: "panel",
				id: "programmatic",
				direction: "column",
				size: "rest",
			},
			panels: new Map([["programmatic", []]]),
			width: 20,
			height: 3,
			left: 4,
			top: 2,
		});
		expect(close).toBeFunction();
		const border = `┌${"─".repeat(18)}┐`;
		expect((await app.frame()).split("\n")[2]?.slice(4, 24)).toBe(border);
		close?.();
		const closed = await app.frame();
		expect(closed.split("\n")[2]?.slice(4, 24)).not.toBe(border);
		expect([...closed.matchAll(/┌─ ([\w-]+) /g)].map((m) => m[1])).toEqual([
			"input",
		]);
	});

	test(`Esc immediately closes only the top Modal (animations ${animations})`, async () => {
		await using app = await start({
			animations,
			extensions: join(import.meta.dir, "fixtures/extensions"),
			config: { placement: { status: ["model.current", "stacker.opener"] } },
		});
		await clickText(app.piu, "open outer");
		await app.frame();
		await clickText(app.piu, "open inner");
		const stacked = await app.frame();
		expect(stacked).toContain("INNER");
		expect(rowOf(stacked, "INNER")).toBe(3);
		expect(columnOf(stacked, "INNER")).toBe(5);
		expect(stacked.split("\n")[2]?.slice(4, 24)).toBe(`┌${"─".repeat(18)}┐`);
		app.piu.mockInput.pressEscape();
		const frame = await app.frame();
		expect(frame).not.toContain("INNER");
		expect(frame).toContain("OUTER");
		await app.piu.mockInput.typeText("blocked");
		app.piu.mockInput.pressEscape();
		await app.piu.mockInput.typeText("draft");
		const closed = await app.frame();
		expect(closed).toContain("draft");
		expect(closed).not.toContain("blocked");
	});
}

function columnOf(frame: string, text: string) {
	const line = frame.split("\n").find((row) => row.includes(text)) ?? "";
	return line.includes(text) ? line.indexOf(text) : -1;
}

async function raiseToast(animations: boolean) {
	const app = await start({
		animations,
		script: {
			uiTool: true,
			replies: [
				{
					toolCalls: [
						{
							name: "ui",
							args: { method: "notify", message: "Build finished" },
						},
					],
				},
				"Done",
			],
		},
	});
	await app.piu.mockInput.typeText("go");
	app.piu.mockInput.pressEnter();
	return app;
}

test("a Toast is fully visible immediately and disappears at its timeout with animations on", async () => {
	await using app = await raiseToast(true);
	await app.piu.waitForFrame((f) => columnOf(f, "Build") >= 0);
	const first = columnOf(await app.frame(), "Build finished");
	expect(first).toBe(143);
	expect(columnOf(await app.frame(2999), "Build finished")).toBe(first);
	expect(columnOf(await app.frame(1), "Build finished")).toBe(-1);
});

test("with animations off a Toast is in place at once and gone when its timeout passes", async () => {
	await using app = await raiseToast(false);
	await app.piu.waitForFrame((f) => columnOf(f, "Build finished") >= 0);
	expect(columnOf(await app.frame(), "Build finished")).toBe(143);
	expect(columnOf(await app.frame(2999), "Build finished")).toBeGreaterThan(0);
	expect(columnOf(await app.frame(1), "Build finished")).toBe(-1);
});

const slowTool = {
	toolCalls: [{ name: "bash", args: { command: "sleep 1.5" } }],
};

function workingLine(frame: string) {
	return frame.split("\n").find((row) => row.includes("Working")) ?? "";
}

test("the working indicator turns while the agent works and goes when it stops", async () => {
	await using app = await start({
		animations: true,
		script: { replies: [slowTool, "All done"] },
	});
	await app.piu.mockInput.typeText("go");
	app.piu.mockInput.pressEnter();
	await app.piu.waitForFrame((f) => f.includes("Working"));

	const lines = new Set<string>();
	for (let step = 0; step < 12; step++) {
		lines.add(workingLine(await app.frame(100)).trim());
	}
	expect(lines.size).toBeGreaterThan(2);

	await app.piu.waitForFrame((f) => f.includes("All done"), 6000);
	expect(workingLine(await app.frame(100))).toBe("");
});

test("with animations off the working indicator is the still text", async () => {
	await using app = await start({
		animations: false,
		script: { replies: [slowTool, "All done"] },
	});
	await app.piu.mockInput.typeText("go");
	app.piu.mockInput.pressEnter();
	await app.piu.waitForFrame((f) => f.includes("Working"));

	const lines = new Set<string>();
	for (let step = 0; step < 6; step++) {
		lines.add(workingLine(await app.frame(100)).trim());
	}
	expect([...lines]).toHaveLength(1);
});

const numberedLines = (count: number) =>
	Array.from({ length: count }, (_, at) => `Line ${at + 1}`).join("\n\n");

function topLine(frame: string) {
	const numbers = [...frame.matchAll(/Line (\d+)/g)].map((m) => Number(m[1]));
	return Math.min(...numbers);
}

async function longChat(animations: boolean) {
	const app = await start({
		animations,
		script: { replies: [numberedLines(120)] },
	});
	await app.piu.mockInput.typeText("Lines");
	app.piu.mockInput.pressEnter();
	await app.piu.waitForFrame((f) => f.includes("Line 119"));
	return app;
}

const WHEEL_TICKS = 10;
const LINES_PER_TICK = 0.5;
const SCROLLED_LINES = WHEEL_TICKS * LINES_PER_TICK;

test("the wheel eases a Panel to its new position through the rows in between", async () => {
	await using app = await longChat(true);
	const before = topLine(await app.frame());
	for (let tick = 0; tick < WHEEL_TICKS; tick++) {
		await app.piu.mockMouse.scroll(10, 5, "up");
	}

	const tops = [topLine(await app.frame())];
	for (let step = 0; step < 12; step++) {
		tops.push(topLine(await app.frame(20)));
	}

	expect(tops[0]).toBe(before);
	expect(tops.at(-1)).toBe(before - SCROLLED_LINES);
	expect(
		tops.some((top) => top < before && top > before - SCROLLED_LINES),
	).toBe(true);
	expect(tops).toEqual([...tops].sort((a, b) => b - a));
});

test("with animations off the wheel moves a Panel at once", async () => {
	await using app = await longChat(false);
	const before = topLine(await app.frame());
	for (let tick = 0; tick < WHEEL_TICKS; tick++) {
		await app.piu.mockMouse.scroll(10, 5, "up");
	}

	expect(topLine(await app.frame())).toBe(before - SCROLLED_LINES);
});

const outputRows = 8;
const listing = {
	toolCalls: [
		{
			name: "bash",
			args: { command: `seq 1 ${outputRows} | sed 's/^/row-/'` },
		},
	],
};

function rowsShown(frame: string) {
	return frame.match(/row-\d+/g)?.length ?? 0;
}

async function toolCardApp(animations: boolean) {
	const app = await start({
		animations,
		script: { replies: [listing, "Listed"] },
	});
	await app.piu.mockInput.typeText("go");
	app.piu.mockInput.pressEnter();
	await app.piu.waitForFrame((f) => f.includes("Listed"), 6000);
	return app;
}

test("expanding a tool card reveals its body row by row", async () => {
	await using app = await toolCardApp(true);
	await clickText(app.piu, "▸ bash");

	const shown = [rowsShown(await app.frame())];
	for (let step = 0; step < 12; step++) {
		shown.push(rowsShown(await app.frame(20)));
	}

	expect(shown[0]).toBe(0);
	expect(shown.at(-1)).toBe(outputRows);
	expect(shown.some((rows) => rows > 0 && rows < outputRows)).toBe(true);
	expect(shown).toEqual([...shown].sort((a, b) => a - b));
});

test("collapsing a tool card hides its body row by row", async () => {
	await using app = await toolCardApp(true);
	await clickText(app.piu, "▸ bash");
	await app.frame(1000);
	await clickText(app.piu, "▾ bash");

	const shown = [rowsShown(await app.frame())];
	for (let step = 0; step < 12; step++) {
		shown.push(rowsShown(await app.frame(20)));
	}

	expect(shown[0]).toBe(outputRows);
	expect(shown.at(-1)).toBe(0);
	expect(shown.some((rows) => rows > 0 && rows < outputRows)).toBe(true);
	expect(shown).toEqual([...shown].sort((a, b) => b - a));
});

test("with animations off a tool card opens and closes at once", async () => {
	await using app = await toolCardApp(false);
	await clickText(app.piu, "▸ bash");
	expect(rowsShown(await app.frame())).toBe(outputRows);

	await clickText(app.piu, "▾ bash");
	expect(rowsShown(await app.frame())).toBe(0);
});

const thoughts = Array.from({ length: 6 }, (_, at) => `thought-${at}`).join(
	"\n",
);

test("expanding a thinking block reveals its lines one after another", async () => {
	await using app = await start({
		animations: true,
		script: { replies: [{ thinking: thoughts, text: "Answer" }] },
	});
	await app.piu.mockInput.typeText("go");
	app.piu.mockInput.pressEnter();
	await app.piu.waitForFrame((f) => f.includes("Answer"));
	await clickText(app.piu, "▸ Thinking");

	const count = (frame: string) => frame.match(/thought-\d/g)?.length ?? 0;
	const shown = [count(await app.frame())];
	for (let step = 0; step < 12; step++) shown.push(count(await app.frame(20)));

	expect(shown[0]).toBe(0);
	expect(shown.at(-1)).toBe(6);
	expect(shown.some((lines) => lines > 0 && lines < 6)).toBe(true);
});
