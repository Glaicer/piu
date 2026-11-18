import { expect, test } from "bun:test";
import {
	inputArea,
	panelBoxes,
	panelText,
	startPiu,
	working,
} from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const slowTool = (seconds: number) => ({
	toolCalls: [{ name: "bash", args: { command: `sleep ${seconds}` } }],
});

test("a working indicator shows while the agent runs and is gone once it settles", async () => {
	await using piu = await startPiu({
		script: { replies: [slowTool(1), "All done"] },
	});
	await piu.renderOnce();
	expect(working(piu.captureCharFrame())).toBe(false);

	await send(piu, "Go");
	await piu.waitForFrame((f) => working(f));

	await piu.waitForFrame((f) => f.includes("All done"));
	await piu.waitForFrame((f) => !working(f));
});

test("Shift+Enter adds a line and Enter sends both lines as one prompt", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
	});

	await piu.mockInput.typeText("line one");
	piu.mockInput.pressEnter({ shift: true });
	await piu.mockInput.typeText("line two");
	const typed = await piu.waitForFrame(
		(f) => f.includes("line one") && f.includes("line two"),
	);
	expect(typed).not.toContain("Model got");

	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes('Model got "line one\\nline two"'));
});

async function sendAndSettle(piu: Piu, text: string, reply: string) {
	await send(piu, text);
	await piu.waitForFrame((f) => f.includes(reply) && !working(f));
}

test("Up and Down walk the prompt history and back to the empty draft", async () => {
	await using piu = await startPiu({
		script: { replies: ["Reply one", "Reply two"] },
	});
	await sendAndSettle(piu, "alpha", "Reply one");
	await sendAndSettle(piu, "bravo", "Reply two");

	piu.mockInput.pressArrow("up");
	await piu.waitForFrame((f) => inputArea(f).includes("bravo"));
	piu.mockInput.pressArrow("up");
	const first = await piu.waitForFrame((f) => inputArea(f).includes("alpha"));
	expect(inputArea(first)).not.toContain("bravo");

	piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => inputArea(f).includes("bravo"));
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(
		(f) => !inputArea(f).includes("bravo") && !inputArea(f).includes("alpha"),
	);
});

test("pasting overflowing lines keeps the last line and cursor in the input", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.renderOnce();
	await piu.mockInput.pasteBracketedText("first\nsecond\nthird\nfourth\n");
	await piu.renderOnce();
	const frame = piu.captureCharFrame();
	const input = inputArea(frame);
	expect(input).toContain("fourth");
	const cursor = piu.renderer.getCursorState();
	expect(cursor.visible).toBe(true);
	const rows = frame.split("\n");
	const fourthRow = rows.findIndex((row) => row.includes("fourth"));
	expect(cursor.y - 1).toBe(fourthRow + 1);
	const panel = panelBoxes(piu).find((box) => box.id === "input");
	expect(cursor.y - 1).toBeGreaterThan(panel?.y ?? 0);
	expect(cursor.y - 1).toBeLessThan((panel?.y ?? 0) + (panel?.height ?? 0) - 1);
});

test("four pasted lines remain visible and arrow keys move within the draft", async () => {
	await using piu = await startPiu({ script: { replies: ["Got {lastUser}"] } });
	await piu.renderOnce();
	await piu.mockInput.pasteBracketedText("first\nsecond\nthird\nfourth");
	await piu.renderOnce();
	for (const line of ["first", "second", "third", "fourth"])
		expect(inputArea(piu.captureCharFrame())).toContain(line);
	piu.mockInput.pressArrow("up");
	piu.mockInput.pressArrow("up");
	piu.mockInput.pressArrow("up");
	await piu.renderOnce();
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressArrow("down");
	await piu.mockInput.typeText("X");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) =>
		f.includes('Got "first\\nsecond\\nthirdX\\nfourth"'),
	);
});

test("Up keeps a nonempty draft instead of recalling history", async () => {
	await using piu = await startPiu({
		script: { replies: ["Reply one", "Got {lastUser}"] },
	});
	await sendAndSettle(piu, "alpha", "Reply one");
	await piu.mockInput.typeText("draft");
	piu.mockInput.pressArrow("up");
	await piu.mockInput.typeText("X");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes('Got "draftX"'));
});

test("during a run Enter steers it and Alt+Enter queues a follow-up for after it", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				slowTool(2),
				{ text: "Steered with {lastUser}", ...slowTool(0.1) },
				"Settled with {lastUser}",
				"Followed with {lastUser}",
			],
		},
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("running"));

	await send(piu, "turn left");
	await piu.mockInput.typeText("then summarize");
	piu.mockInput.pressEnter({ meta: true });

	await piu.waitForFrame((f) => f.includes('Steered with "turn left"'));
	await piu.waitForFrame((f) => f.includes('Settled with "turn left"'));
	await piu.waitForFrame((f) => f.includes('Followed with "then summarize"'));
});

test("Esc during a run aborts it and the indicator goes away", async () => {
	await using piu = await startPiu({
		script: { replies: [slowTool(30), "Never reached"] },
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("running"));

	piu.mockInput.pressEscape();

	const frame = await piu.waitForFrame(
		(f) =>
			!working(f) &&
			panelText(f, 10).trimEnd().endsWith("· request interrupted"),
	);
	expect(frame).not.toContain("running");
	expect(frame).not.toContain("Never reached");
	expect(panelText(frame, 10).trimEnd()).toMatch(
		/\S[^\n]*\n[ \t]*\n[ \t]*· request interrupted$/,
	);
});

test("Down keeps a nonempty draft instead of recalling history", async () => {
	await using piu = await startPiu({ script: { replies: ["Reply one"] } });
	await sendAndSettle(piu, "alpha", "Reply one");

	await piu.mockInput.typeText("half-typed");
	piu.mockInput.pressArrow("down");
	await piu.renderOnce();
	expect(inputArea(piu.captureCharFrame())).toContain("half-typed");
});

test("the indicator goes away when the Backend dies mid-run", async () => {
	await using piu = await startPiu({
		script: {
			replies: [slowTool(30)],
			crash: { code: 3, stderr: "kaboom\n" },
		},
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => working(f));

	await send(piu, "/crash");

	const frame = await piu.waitForFrame((f) => f.includes("Restart"));
	expect(working(frame)).toBe(false);
});
