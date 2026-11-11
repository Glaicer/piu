import { expect, test } from "bun:test";
import { ManualClock } from "@opentui/core/testing";
import { type FauxScript, startPiu } from "./harness.ts";

const none: FauxScript = { replies: [] };

function rowOf(frame: string, text: string) {
	return frame.split("\n").findLastIndex((line) => line.includes(text));
}

async function start(options: {
	animations: boolean;
	script?: FauxScript;
	config?: object;
}) {
	const clock = new ManualClock();
	const piu = await startPiu({
		script: options.script ?? none,
		clock,
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

test("an opening Modal slides through intermediate rows before it settles", async () => {
	await using app = await start({ animations: true });
	await clickText(app.piu, "faux-1");

	const rows: number[] = [rowOf(await app.frame(), "faux-2")];
	for (let step = 0; step < 15; step++) {
		rows.push(rowOf(await app.frame(20), "faux-2"));
	}

	const final = rows.at(-1) ?? -1;
	const first = rows[0] ?? -1;
	expect(first).toBeGreaterThanOrEqual(0);
	expect(first).not.toBe(final);
	expect(rows.some((row) => row !== first && row !== final)).toBe(true);
	expect(rows).toEqual([...rows].sort((a, b) => a - b));
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

test("a dismissed Modal slides out and is gone once it has finished", async () => {
	await using app = await start({ animations: true });
	await clickText(app.piu, "faux-1");
	await app.frame(1000);
	await app.piu.mockMouse.click(1, 1);

	const rows: number[] = [];
	for (let step = 0; step < 15; step++) {
		rows.push(rowOf(await app.frame(step === 0 ? 0 : 20), "faux-2"));
	}

	expect(rows[0]).toBeGreaterThanOrEqual(0);
	expect(rows.at(-1)).toBe(-1);
	const visible = rows.filter((row) => row >= 0);
	expect(visible.length).toBeGreaterThan(1);
	expect(new Set(visible).size).toBeGreaterThan(1);
});

test("with animations off a dismissed Modal is gone on the first frame", async () => {
	await using app = await start({ animations: false });
	await clickText(app.piu, "faux-1");
	await app.frame();
	await app.piu.mockMouse.click(1, 1);
	expect(rowOf(await app.frame(), "faux-2")).toBe(-1);
});

test("Esc dismisses a Modal while animations are on", async () => {
	await using app = await start({ animations: true });
	await clickText(app.piu, "faux-1");
	await app.frame(1000);
	app.piu.mockInput.pressEscape();
	await app.frame(20);
	await app.frame(1000);
	expect(rowOf(await app.frame(), "faux-2")).toBe(-1);
});

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

test("a Toast slides in from the right edge and out again after its timeout", async () => {
	await using app = await raiseToast(true);
	await app.piu.waitForFrame((f) => columnOf(f, "Build") >= 0);

	const entering: number[] = [columnOf(app.piu.captureCharFrame(), "Build")];
	for (let step = 0; step < 15; step++) {
		entering.push(columnOf(await app.frame(20), "Build"));
	}
	const settled = entering.at(-1) ?? -1;
	expect(entering[0]).toBeGreaterThan(settled);
	expect(
		entering.some((col) => col > settled && col < (entering[0] ?? 0)),
	).toBe(true);

	await app.frame(2600);
	const leaving: number[] = [];
	for (let step = 0; step < 20; step++) {
		leaving.push(columnOf(await app.frame(20), "Build"));
	}
	const shown = leaving.filter((col) => col >= 0);
	expect(shown.some((col) => col > settled)).toBe(true);
	expect(leaving.at(-1)).toBe(-1);
});

test("with animations off a Toast is in place at once and gone when its timeout passes", async () => {
	await using app = await raiseToast(false);
	await app.piu.waitForFrame((f) => columnOf(f, "Build finished") >= 0);
	expect(columnOf(await app.frame(), "Build finished")).toBeGreaterThan(0);

	expect(columnOf(await app.frame(3000), "Build finished")).toBe(-1);
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
