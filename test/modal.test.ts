import { expect, test } from "bun:test";
import { join } from "node:path";
import { type FauxScript, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const none: FauxScript = { replies: [] };
const extensions = join(import.meta.dir, "fixtures/extensions");
const modelConfig = {
	placement: { status: ["model.current", "reasoning.level"] },
};

function locate(frame: string, text: string) {
	const rows = frame.split("\n");
	const row = rows.findLastIndex((line) => line.includes(text));
	if (row < 0) throw new Error(`"${text}" is not in the frame:\n${frame}`);
	return { x: (rows[row] ?? "").indexOf(text) + 1, y: row };
}

function count(frame: string, text: string) {
	return frame.split(text).length - 1;
}

async function clickText(piu: Piu, text: string) {
	const { x, y } = locate(piu.captureCharFrame(), text);
	await piu.mockMouse.click(x, y);
}

async function start(script: FauxScript = none) {
	const piu = await startPiu({ script, config: modelConfig });
	await piu.waitForFrame((f) => f.includes("faux-1"));
	return piu;
}

test("clicking the model opens a centered Modal of the Backend's models, and picking one switches the Backend", async () => {
	await using piu = await start({ replies: ["Answered by {model}"] });

	await clickText(piu, "faux-1");
	const open = await piu.waitForFrame((f) => f.includes("faux-2"));
	const rows = open.split("\n");
	const center = locate(open, "faux-2");
	expect(Math.abs(center.y - rows.length / 2)).toBeLessThan(6);
	expect(Math.abs(center.x - 80)).toBeLessThan(30);

	await clickText(piu, "faux-2");
	const closed = await piu.waitForFrame(
		(f) => f.includes("faux-2") && !f.includes("faux-1"),
	);
	expect(closed).toContain("faux-2");

	await piu.mockInput.typeText("Hi");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Answered by faux-2"));
});

test("the reasoning picker lists only the levels the current model supports, and picking one updates it", async () => {
	await using piu = await start();

	await clickText(piu, "Reasoning: off");
	const plain = await piu.waitForFrame((f) => count(f, "off") === 2);
	expect(plain).not.toContain("high");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => count(f, "off") === 1);
	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	await clickText(piu, "faux-2");
	await piu.waitForFrame((f) => !f.includes("faux-1"));

	await clickText(piu, "Reasoning: off");
	const levels = await piu.waitForFrame((f) => f.includes("high"));
	expect(levels).toContain("minimal");
	await clickText(piu, "high");
	await piu.waitForFrame(
		(f) => f.includes("Reasoning: high") && !f.includes("minimal"),
	);
});

test("Esc closes the Modal", async () => {
	await using piu = await start();

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	const closed = await piu.waitForFrame((f) => !f.includes("faux-2"));
	expect(closed).toContain("faux-1");
});

test("a click outside closes the Modal without picking anything", async () => {
	await using piu = await start();

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	await piu.mockMouse.click(3, 3);
	const closed = await piu.waitForFrame((f) => !f.includes("faux-2"));
	expect(closed).toContain("faux-1");
});

test("typing while a Modal is open leaves the input underneath unchanged", async () => {
	await using piu = await start();
	await piu.mockInput.typeText("draft");
	await piu.waitForFrame((f) => f.includes("draft"));

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	await piu.mockInput.typeText("xyz");
	piu.mockInput.pressBackspace();
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));

	const frame = piu.captureCharFrame();
	expect(frame).toContain("draft");
	expect(frame).not.toContain("xyz");

	await piu.mockInput.typeText("!");
	await piu.waitForFrame((f) => f.includes("draft!"));
});

test("Esc closes the Modal and does not abort a running agent", async () => {
	await using piu = await start({
		replies: [
			{ toolCalls: [{ name: "bash", args: { command: "sleep 1" } }] },
			"Finished the run",
		],
	});
	await piu.mockInput.typeText("Go");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Working"));

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));

	await piu.waitForFrame((f) => f.includes("Finished the run"));
});

test("a Modal opened from a Modal stacks, and Esc closes only the top one", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { status: ["stacker.opener"] } },
	});

	await piu.waitForFrame((f) => f.includes("open outer"));
	await clickText(piu, "open outer");
	await piu.waitForFrame((f) => f.includes("OUTER"));
	await clickText(piu, "open inner");
	const stacked = await piu.waitForFrame((f) => f.includes("INNER"));
	const inner = locate(stacked, "INNER");
	expect(inner.y).toBeLessThan(6);
	expect(inner.x).toBeLessThan(12);

	piu.mockInput.pressEscape();
	const outerOnly = await piu.waitForFrame((f) => !f.includes("INNER"));
	expect(outerOnly).toContain("OUTER");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("OUTER"));
});

test("typing is held back from the input even when nothing in the Modal takes keys", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { status: ["stacker.opener"] } },
	});
	await piu.mockInput.typeText("draft");
	await piu.waitForFrame((f) => f.includes("draft"));

	await clickText(piu, "open outer");
	await piu.waitForFrame((f) => f.includes("OUTER"));
	await piu.mockInput.typeText("xyz");
	await piu.mockInput.pasteBracketedText("pasted");
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("OUTER"));

	await piu.mockInput.typeText("!");
	const frame = await piu.waitForFrame((f) => f.includes("draft!"));
	expect(frame).not.toContain("xyz");
	expect(frame).not.toContain("pasted");
});

test("the model picker works from the keyboard: Down moves, Enter picks", async () => {
	await using piu = await start({ replies: ["Answered by {model}"] });

	await clickText(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("faux-2") && !f.includes("faux-1"));

	await piu.mockInput.typeText("Hi");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("Answered by faux-2"));
});

test("a click outside a stacked Modal closes only the top one", async () => {
	await using piu = await startPiu({
		script: none,
		extensions,
		config: { placement: { status: ["stacker.opener"] } },
	});
	await piu.waitForFrame((f) => f.includes("open outer"));
	await clickText(piu, "open outer");
	await piu.waitForFrame((f) => f.includes("OUTER"));
	await clickText(piu, "open inner");
	await piu.waitForFrame((f) => f.includes("INNER"));

	await piu.mockMouse.click(100, 25);
	const frame = await piu.waitForFrame((f) => !f.includes("INNER"));
	expect(frame).toContain("OUTER");
});
