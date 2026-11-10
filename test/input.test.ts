import { expect, test } from "bun:test";
import { inputArea, startPiu } from "./harness.ts";

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
	expect(piu.captureCharFrame()).not.toContain("Working");

	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("Working"));

	await piu.waitForFrame((f) => f.includes("All done"));
	await piu.waitForFrame((f) => !f.includes("Working"));
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
	await piu.waitForFrame((f) => f.includes(reply) && !f.includes("Working"));
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

	const frame = await piu.waitForFrame((f) => !f.includes("Working"));
	expect(frame).not.toContain("running");
	expect(frame).not.toContain("Never reached");
});

test("Down after the newest history entry brings back the half-typed draft", async () => {
	await using piu = await startPiu({ script: { replies: ["Reply one"] } });
	await sendAndSettle(piu, "alpha", "Reply one");

	await piu.mockInput.typeText("half-typed");
	piu.mockInput.pressArrow("up");
	await piu.waitForFrame(
		(f) => inputArea(f).includes("alpha") && !inputArea(f).includes("half"),
	);
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(
		(f) =>
			inputArea(f).includes("half-typed") && !inputArea(f).includes("alpha"),
	);
});

test("the indicator goes away when the Backend dies mid-run", async () => {
	await using piu = await startPiu({
		script: {
			replies: [slowTool(30)],
			crash: { code: 3, stderr: "kaboom\n" },
		},
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("Working"));

	await send(piu, "/crash");

	const frame = await piu.waitForFrame((f) => f.includes("Restart"));
	expect(frame).not.toContain("Working");
});
