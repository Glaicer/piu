import { expect, test } from "bun:test";
import { inputArea, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

async function focusAgent(piu: Piu) {
	piu.mockInput.pressTab({ shift: true });
	await piu.waitForFrame((f) => /┌─ agent /.test(f));
}

test("with the agent Panel focused the arrow keys scroll it", async () => {
	const lines = Array.from({ length: 30 }, (_, i) => `Row ${i + 1}`);
	await using piu = await startPiu({
		script: { replies: [lines.join("\n\n")] },
		height: 16,
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("Row 30"));
	await focusAgent(piu);
	const bottom = await piu.waitForFrame((f) => f.includes("Row 30"));
	expect(bottom).not.toContain("Row 1\n");

	for (let i = 0; i < 70; i++) piu.mockInput.pressArrow("up");

	const top = await piu.waitForFrame((f) => /Row 1\s/.test(f));
	expect(top).not.toContain("Row 30");
});

test("with the agent Panel focused Enter expands the selected tool card", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [
						{ name: "bash", args: { command: "printf RESULT%s MARK" } },
					],
				},
				"Card is done",
			],
		},
	});
	await send(piu, "Run it");
	const done = await piu.waitForFrame((f) => f.includes("Card is done"));
	expect(done).not.toContain("RESULTMARK");

	await focusAgent(piu);
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => f.includes("› ▸ bash"));
	piu.mockInput.pressEnter();

	const open = await piu.waitForFrame((f) => f.includes("RESULTMARK"));
	expect(open).toContain("▾ bash");
});

test("the Restart button on the Backend error card can be selected and pressed by keyboard", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Context holds {messages}"],
			crash: { code: 3, stderr: "kaboom\n" },
		},
		persistSession: true,
	});
	await send(piu, "First");
	await piu.waitForFrame((f) => f.includes("Context holds 1"));
	await send(piu, "/crash");
	await piu.waitForFrame((f) => f.includes("Restart"));

	await focusAgent(piu);
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => f.includes("› Restart"));
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) => !f.includes("Restart"));
	piu.mockInput.pressTab();
	await piu.waitForFrame((f) => /┌─ input /.test(f));
	await send(piu, "Second");
	await piu.waitForFrame((f) => f.includes("Context holds 3"));
});

test("Ctrl+L opens the model picker by default", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.waitForFrame((f) => f.includes("faux-1"));

	piu.mockInput.pressKey("l", { ctrl: true });

	await piu.waitForFrame((f) => f.includes("faux-2"));
});

test("a keybindings remap changes which key opens the model picker", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		config: { keybindings: { "command.model": "ctrl+k" } },
	});
	await piu.waitForFrame((f) => f.includes("faux-1"));

	piu.mockInput.pressKey("k", { ctrl: true });
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));

	piu.mockInput.pressKey("l", { ctrl: true });
	await Bun.sleep(150);
	await piu.renderOnce();
	expect(piu.captureCharFrame()).not.toContain("faux-2");
});

async function expectNewline(piu: Piu, newline: () => void) {
	await piu.mockInput.typeText("line one");
	newline();
	await piu.mockInput.typeText("line two");
	await piu.waitForFrame(
		(f) => f.includes("line one") && f.includes("line two"),
	);
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes('Model got "line one\\nline two"'));
}

test("Ctrl+J inserts a newline in a terminal without the kitty protocol", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
		kittyKeyboard: false,
	});

	await expectNewline(piu, () => piu.mockInput.pressKey("LINEFEED"));
});

test("Ctrl+J inserts a newline in a terminal with the kitty protocol", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
	});

	await expectNewline(piu, () => piu.mockInput.pressKey("j", { ctrl: true }));
});

test("the newline key can be remapped", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
		config: { keybindings: { "input.newline": "alt+n" } },
	});

	await expectNewline(piu, () => piu.mockInput.pressKey("n", { meta: true }));
});

test("a remapped newline key frees Ctrl+J", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		config: { keybindings: { "input.newline": "alt+n" } },
		kittyKeyboard: false,
	});

	await piu.mockInput.typeText("one");
	piu.mockInput.pressKey("LINEFEED");
	await piu.mockInput.typeText("two");

	await piu.waitForFrame((f) => f.includes("onetwo"));
});

const slowTool = (seconds: number) => ({
	toolCalls: [{ name: "bash", args: { command: `sleep ${seconds}` } }],
});

async function expectQueueRestoredByEsc(
	queue: (piu: Piu) => void,
	queued: string,
) {
	await using piu = await startPiu({
		script: { replies: [slowTool(5), "Model got {lastUser}"] },
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("Working"));
	await piu.mockInput.typeText(queued);
	queue(piu);
	await Bun.sleep(300);

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("Working"));
	const restored = await piu.waitForFrame((f) => inputArea(f).includes(queued));
	await Bun.sleep(500);
	await piu.renderOnce();
	expect(piu.captureCharFrame()).not.toContain(`> ${queued}`);
	expect(restored).not.toContain("Model got");

	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes(`Model got "${queued}"`));
}

test("Esc during a run with a queued steer aborts, drops the steer from the queue and puts its text back into the input", async () => {
	await expectQueueRestoredByEsc(
		(piu) => piu.mockInput.pressEnter(),
		"steer me",
	);
});

test("Esc during a run with a queued follow-up aborts, drops it from the queue and puts its text back into the input", async () => {
	await expectQueueRestoredByEsc(
		(piu) => piu.mockInput.pressEnter({ meta: true }),
		"follow me",
	);
});

test("the Thinking label can be selected and opened by keyboard", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{ thinking: "Weighing walrus options carefully", text: "Done" },
			],
		},
	});
	await send(piu, "Go");
	const closed = await piu.waitForFrame((f) => f.includes("▸ Thinking"));
	expect(closed).not.toContain("walrus");

	await focusAgent(piu);
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => f.includes("› ▸ Thinking"));
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) => f.includes("walrus"));
});
