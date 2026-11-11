import { expect, test } from "bun:test";
import { join } from "node:path";
import { inputArea, startPiu } from "./harness.ts";

const none = { replies: [] };

function focusedPanels(frame: string) {
	return [...frame.matchAll(/┌─ ([\w-]+) /g)].map((match) => match[1]);
}

async function focusedAfter(
	piu: Awaited<ReturnType<typeof startPiu>>,
	expected: string,
) {
	await piu.waitForFrame((f) => focusedPanels(f).join() === expected);
}

async function clickAndStay(
	piu: Awaited<ReturnType<typeof startPiu>>,
	x: number,
	y: number,
) {
	await piu.mockMouse.click(x, y);
	await piu.renderOnce();
	expect(focusedPanels(piu.captureCharFrame())).toEqual(["input"]);
}

const extensionsDir = join(import.meta.dir, "fixtures/extensions");

test("Tab moves the focus indication through the Panels that take keys in Layout order and wraps around", async () => {
	await using piu = await startPiu({ script: none });

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "agent");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "input");
});

test("Shift+Tab moves the focus the other way", async () => {
	await using piu = await startPiu({ script: none });

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab({ shift: true });
	await focusedAfter(piu, "agent");
	piu.mockInput.pressTab({ shift: true });
	await focusedAfter(piu, "input");
});

const sideHasModule = {
	placement: { side: ["keyed.pad"] },
};

test("a Panel whose Module handles keys is part of the Tab order", async () => {
	await using piu = await startPiu({
		script: none,
		config: sideHasModule,
		extensionsDir,
	});

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "side");
});

test("Tab skips a Panel where keys do nothing", async () => {
	await using piu = await startPiu({
		script: none,
		config: { placement: { side: ["reasoning.level"] } },
	});

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "agent");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "input");
});

test("Tab skips a Panel hidden below its hideBelow width", async () => {
	await using piu = await startPiu({
		script: none,
		config: sideHasModule,
		extensionsDir,
		width: 100,
	});

	await focusedAfter(piu, "input");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "agent");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "input");
});

test("clicking inside a Panel leaves the focus in the input, and typing lands there", async () => {
	await using piu = await startPiu({ script: none });
	await focusedAfter(piu, "input");

	await clickAndStay(piu, 5, 3);
	await piu.mockInput.typeText("abc");

	const frame = await piu.waitForFrame((f) => inputArea(f).includes("abc"));
	expect(focusedPanels(frame)).toEqual(["input"]);
});

test("clicking the status Panel leaves the focus in the input", async () => {
	await using piu = await startPiu({ script: none });
	await focusedAfter(piu, "input");
	const rows = (await piu.waitForFrame((f) => f.includes("faux-1"))).split(
		"\n",
	);

	await clickAndStay(
		piu,
		100,
		rows.findIndex((row) => row.includes("faux-1")),
	);
	await piu.mockInput.typeText("abc");

	await piu.waitForFrame((f) => inputArea(f).includes("abc"));
});

test("clicking the model Module still opens its picker, and the focus is back in the input after it closes", async () => {
	await using piu = await startPiu({ script: none });
	const rows = (await piu.waitForFrame((f) => f.includes("faux-1"))).split(
		"\n",
	);
	const row = rows.findIndex((line) => line.includes("faux-1"));

	await piu.mockMouse.click(rows[row]?.indexOf("faux-1") ?? 0, row);
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));
	await piu.mockInput.typeText("abc");

	const frame = await piu.waitForFrame((f) => inputArea(f).includes("abc"));
	expect(focusedPanels(frame)).toEqual(["input"]);
});

test("clicking a tool card still expands it and leaves the focus in the input", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [{ name: "bash", args: { command: "printf RES%s ULT" } }],
				},
				"Card is done",
			],
		},
	});
	await piu.mockInput.typeText("Run it");
	piu.mockInput.pressEnter();
	const done = await piu.waitForFrame((f) => f.includes("Card is done"));
	const rows = done.split("\n");
	const row = rows.findIndex((line) => line.includes("▸ bash"));

	await clickAndStay(piu, rows[row]?.indexOf("▸ bash") ?? 0, row);
	await piu.waitForFrame((f) => f.includes("RESULT"));
	await piu.mockInput.typeText("abc");

	const frame = await piu.waitForFrame((f) => inputArea(f).includes("abc"));
	expect(focusedPanels(frame)).toEqual(["input"]);
});

test("clicking a Thinking label still opens it and leaves the focus in the input", async () => {
	await using piu = await startPiu({
		script: { replies: [{ thinking: "Deep thought", text: "Answer" }] },
	});
	await piu.mockInput.typeText("Go");
	piu.mockInput.pressEnter();
	const done = await piu.waitForFrame((f) => f.includes("Answer"));
	expect(done).not.toContain("Deep thought");
	const rows = done.split("\n");
	const row = rows.findIndex((line) => line.includes("▸ Thinking"));

	await clickAndStay(piu, rows[row]?.indexOf("▸ Thinking") ?? 0, row);
	await piu.waitForFrame((f) => f.includes("Deep thought"));
	await piu.mockInput.typeText("abc");

	const frame = await piu.waitForFrame((f) => inputArea(f).includes("abc"));
	expect(focusedPanels(frame)).toEqual(["input"]);
});

test("with the focus moved to a Panel without a text field, a printable key goes to the input", async () => {
	await using piu = await startPiu({ script: none });
	await focusedAfter(piu, "input");
	piu.mockInput.pressTab();
	await focusedAfter(piu, "agent");

	await piu.mockInput.typeText("hi there");

	const frame = await piu.waitForFrame((f) =>
		inputArea(f).includes("hi there"),
	);
	expect(focusedPanels(frame)).toEqual(["input"]);
});

test("Esc aborts a run whichever Panel has the focus", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{ toolCalls: [{ name: "bash", args: { command: "sleep 30" } }] },
				"Never reached",
			],
		},
	});
	await piu.mockInput.typeText("Go");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("running"));
	piu.mockInput.pressTab();
	await focusedAfter(piu, "agent");

	piu.mockInput.pressEscape();

	await piu.waitForFrame((f) => !f.includes("running"));
});
