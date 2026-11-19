import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ManualClock } from "@opentui/core/testing";
import { blocker } from "./blocker.ts";
import {
	focusedPanels,
	inputArea,
	messageBar,
	panelText,
	prepareFixture,
	startPiu,
	working,
} from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

async function focusAgent(piu: Piu) {
	piu.mockInput.pressTab({ shift: true });
	await piu.waitForFrame((f) => focusedPanels(piu, f).includes("agent"));
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

	const top = await piu.waitForFrame((f) =>
		panelText(f, 10)
			.split("\n")
			.some((line) => line.includes(messageBar("Go "))),
	);
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
	await piu.waitForFrame((f) => f.includes("› bash"));
	piu.mockInput.pressEnter();

	const open = await piu.waitForFrame((f) => f.includes("RESULTMARK"));
	expect(open).toContain(" bash");
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
	await piu.waitForFrame((f) => focusedPanels(piu, f).includes("input"));
	await send(piu, "Second");
	await piu.waitForFrame((f) => f.includes("Context holds 3"));
});

test("Ctrl+L opens the model picker by default", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.waitForFrame((f) => f.includes("faux-1"));

	piu.mockInput.pressKey("l", { ctrl: true });

	await piu.waitForFrame((f) => f.includes("faux-2"));
});

test("Home and End move within the current prompt line", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.mockInput.typeText("first line\nsecond line");
	piu.mockInput.pressKey("HOME");
	await piu.mockInput.typeText("START ");
	piu.mockInput.pressArrow("up");
	piu.mockInput.pressKey("END");
	await piu.mockInput.typeText(" END");
	await piu.waitForFrame((f) => {
		const input = inputArea(f);
		return (
			input.includes("first line END") && input.includes("START second line")
		);
	});
});

test("Ctrl+] and Ctrl+Alt+] jump to the next and previous character", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.mockInput.typeText("界x-one-x-two");
	piu.mockInput.pressKey("a", { ctrl: true });
	piu.mockInput.pressKey("]", { ctrl: true });
	piu.mockInput.pressKey("x");
	await piu.mockInput.typeText("F");
	piu.mockInput.pressKey("e", { ctrl: true });
	piu.mockInput.pressKey("]", { ctrl: true, meta: true });
	piu.mockInput.pressKey("x");
	await piu.mockInput.typeText("B");
	await piu.waitForFrame((f) => inputArea(f).includes("界Fx-one-Bx-two"));
});

test("Ctrl+Y yanks deleted text and Alt+Y replaces it with an older deletion", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.mockInput.typeText("one two");
	piu.mockInput.pressKey("w", { ctrl: true });
	await piu.mockInput.typeText("three");
	piu.mockInput.pressKey("w", { ctrl: true });
	piu.mockInput.pressKey("y", { ctrl: true });
	await piu.waitForFrame((f) => inputArea(f).includes("one three"));
	piu.mockInput.pressKey("y", { meta: true });
	await piu.waitForFrame((f) => inputArea(f).includes("one two"));
});

for (const { name, key, modifiers, before, deleted } of [
	{
		name: "Alt+Backspace",
		key: "BACKSPACE",
		modifiers: { meta: true },
		before: false,
		deleted: "one",
	},
	{
		name: "Alt+D",
		key: "d",
		modifiers: { meta: true },
		before: true,
		deleted: " two",
	},
	{
		name: "Alt+Delete",
		key: "DELETE",
		modifiers: { meta: true },
		before: true,
		deleted: " two",
	},
	{
		name: "Ctrl+U",
		key: "u",
		modifiers: { ctrl: true },
		before: false,
		deleted: "",
	},
	{
		name: "Ctrl+K",
		key: "k",
		modifiers: { ctrl: true },
		before: true,
		deleted: "",
	},
] as const) {
	test(`${name} deletes text that Ctrl+Y can yank and Ctrl+- can undo`, async () => {
		await using piu = await startPiu({ script: { replies: [] } });
		await piu.mockInput.typeText("one two");
		if (before) piu.mockInput.pressKey("HOME");
		piu.mockInput.pressKey(key, modifiers);
		await piu.waitForFrame((f) => inputArea(f).trim() === deleted.trim());
		piu.mockInput.pressKey("y", { ctrl: true });
		await piu.waitForFrame((f) => inputArea(f).trim() === "one two");
		piu.mockInput.pressKey("-", { ctrl: true });
		await piu.waitForFrame((f) => inputArea(f).trim() === deleted.trim());
	});
}

test("Ctrl+C clears a draft and Ctrl+D deletes forward when it is not empty", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.mockInput.typeText("draft");
	piu.mockInput.pressKey("a", { ctrl: true });
	piu.mockInput.pressKey("d", { ctrl: true });
	await piu.waitForFrame(
		(f) => inputArea(f).includes("raft") && !inputArea(f).includes("draft"),
	);
	piu.mockInput.pressKey("c", { ctrl: true });
	await piu.mockInput.typeText("new draft");
	await piu.waitForFrame((f) => inputArea(f).trim() === "new draft");
});

test("Ctrl+- undoes an edit when a legacy terminal sends Ctrl+_", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		kittyKeyboard: false,
	});
	await piu.mockInput.typeText("undo me");
	await piu.waitForFrame((f) => inputArea(f).includes("undo me"));
	piu.mockInput.pressKey("\x1f");
	await piu.waitForFrame((f) => inputArea(f).trim() === "undo m");
});

test("Ctrl+C clears a draft without arming exit, then warns on empty input", async () => {
	const clock = new ManualClock();
	await using piu = await startPiu({ script: { replies: [] }, clock });
	await piu.mockInput.typeText("draft");
	await piu.waitForFrame((f) => inputArea(f).includes("draft"));
	const press = () => piu.mockInput.pressKey("c", { ctrl: true });
	const notice = "Press Ctrl+C once again to exit";
	press();
	const cleared = await piu.waitForFrame((f) => !inputArea(f).trim());
	expect(cleared).not.toContain(notice);
	press();
	await piu.waitForFrame((f) => f.includes(notice));
	expect(piu.exits).toEqual([]);

	clock.advance(2_001);
	await piu.waitForFrame((f) => !f.includes(notice));
	press();
	await piu.waitForFrame((f) => f.includes(notice));
	expect(piu.exits).toEqual([]);

	await piu.mockInput.typeText("new draft");
	await piu.waitForFrame(
		(f) => inputArea(f).includes("new draft") && !f.includes(notice),
	);
	press();
	await piu.waitForFrame((f) => !inputArea(f).trim());
	expect(piu.exits).toEqual([]);
});

test("Ctrl+P and Ctrl+Shift+P cycle the current model in both directions", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("p", { ctrl: true });
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressKey("p", { ctrl: true, shift: true });
	await piu.waitForFrame((f) => f.includes("faux-1"));
});

test("Ctrl+X copies the last assistant reply without a selection", async () => {
	await using piu = await startPiu({
		script: { replies: ["Copy this reply"] },
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("Copy this reply") && !working(f));
	piu.mockInput.pressKey("x", { ctrl: true });
	await piu.waitForFrame((f) => f.includes("Copied to clipboard"));
	expect(piu.copied.map(({ text }) => text)).toEqual(["Copy this reply"]);
});

test("a bang command runs through the Backend without starting a model turn", async () => {
	await using piu = await startPiu({
		script: { replies: ["Model got {lastUser}"] },
	});
	await send(piu, "!printf SHELL%s RESULT");
	await piu.waitForFrame((f) => f.includes("SHELLRESULT"));
	expect(piu.captureCharFrame()).not.toContain("Model got");
});

test("double bang output is shown but only single bang output reaches the model", async () => {
	await using piu = await startPiu({
		script: { replies: ["History has {messages}"] },
	});
	await send(piu, "!printf included");
	await piu.waitForFrame(
		(f) =>
			f.includes("· !printf included") &&
			f.split("\n").some((line) => line.trim() === "included"),
	);
	await send(piu, "!!printf excluded");
	await piu.waitForFrame((f) =>
		f.split("\n").some((line) => line.trim() === "excluded"),
	);
	await send(piu, "Check");
	await piu.waitForFrame((f) => f.includes("History has 2"));
});

test("Alt+Up restores a follow-up without interrupting the running turn", async () => {
	using tool = blocker();
	await using piu = await startPiu({
		script: {
			replies: [tool.step, "Original run finished", "Model got {lastUser}"],
		},
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("running") && working(f));
	await piu.mockInput.typeText("Follow-up");
	piu.mockInput.pressEnter({ meta: true });
	await piu.waitForFrame((f) => f.includes("[queued: follow-up]"));
	piu.mockInput.pressArrow("up", { meta: true });
	await piu.waitForFrame(
		(f) =>
			working(f) &&
			inputArea(f).includes("Follow-up") &&
			!f.includes("[queued: follow-up]"),
	);
	tool.release();
	await piu.waitForFrame(
		(f) => f.includes("Original run finished") && !working(f),
	);
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes('Model got "Follow-up"'));
});

test("Alt+Shift+T cycles reasoning without changing Panel focus", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		args: ["--model", "faux/faux-2", "--thinking", "off"],
	});
	await piu.waitForFrame((f) => f.includes("faux-2 · no reasoning"));
	piu.mockInput.pressKey("t", { meta: true, shift: true });
	await piu.waitForFrame(
		(f) =>
			f.includes("faux-2 · minimal") && focusedPanels(piu, f).includes("input"),
	);
});

test("Ctrl+O and Ctrl+T expand and collapse tool output and thinking", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					thinking: "Private reasoning text",
					toolCalls: [
						{ name: "bash", args: { command: "printf TOOL%s OUTPUT" } },
					],
				},
				"Done",
			],
		},
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("Done") && f.includes("Thinking"));
	piu.mockInput.pressKey("o", { ctrl: true });
	await piu.waitForFrame((f) => f.includes("TOOLOUTPUT"));
	piu.mockInput.pressKey("t", { ctrl: true });
	await piu.waitForFrame(
		(f) => f.includes("Private reasoning text") && f.includes("TOOLOUTPUT"),
	);
	piu.mockInput.pressKey("o", { ctrl: true });
	piu.mockInput.pressKey("t", { ctrl: true });
	await piu.waitForFrame(
		(f) =>
			f.includes("Done") &&
			!f.includes("Private reasoning text") &&
			!f.includes("TOOLOUTPUT"),
	);
});

test("PageUp and Ctrl+PageDown scroll chat without taking focus from the prompt", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				Array.from({ length: 30 }, (_, at) => `Page row ${at}`).join("\n\n"),
			],
		},
		height: 16,
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("Page row 29"));
	piu.mockInput.pressKey("\x1b[5~");
	await piu.waitForFrame(
		(f) =>
			f.includes("Page row") &&
			!f.includes("Page row 29") &&
			focusedPanels(piu, f).includes("input"),
	);
	piu.mockInput.pressKey("\x1b[6;5~");
	await piu.waitForFrame((f) => f.includes("Page row 29"));
});

test("Ctrl+V inserts clipboard text at the cursor", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		clipboardContents: {
			mimeType: "text/plain",
			bytes: new TextEncoder().encode("pasted "),
		},
	});
	await piu.mockInput.typeText("after");
	piu.mockInput.pressKey("HOME");
	piu.mockInput.pressKey("v", { ctrl: true });
	await piu.waitForFrame((f) => inputArea(f).includes("pasted after"));
});

test("Ctrl+V attaches an image and Alt+Up restores it with a queued draft", async () => {
	using tool = blocker();
	await using piu = await startPiu({
		script: {
			replies: [tool.step, "Original run finished", "Model got {lastUser}"],
		},
		clipboardContents: {
			mimeType: "image/png",
			bytes: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
				"base64",
			),
		},
	});
	await send(piu, "Go");
	await piu.waitForFrame(working);
	await piu.mockInput.typeText("Image attached");
	piu.mockInput.pressKey("v", { ctrl: true });
	await piu.waitForFrame((f) => f.includes("1 image"));
	piu.mockInput.pressEnter({ meta: true });
	await piu.waitForFrame(
		(f) => f.includes("[queued: follow-up]") && !f.includes("1 image"),
	);
	piu.mockInput.pressArrow("up", { meta: true });
	await piu.waitForFrame(
		(f) => inputArea(f).includes("Image attached") && f.includes("1 image"),
	);
	tool.release();
	await piu.waitForFrame(
		(f) => f.includes("Original run finished") && !working(f),
	);
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(f) =>
			f.includes('Model got "Image attached"') &&
			f.includes("[1 image]") &&
			!working(f),
	);
});

test("Tab completes a relative path", async () => {
	const fixture = prepareFixture({ script: { replies: [] } });
	try {
		writeFileSync(join(fixture.dir, "sample.txt"), "");
		await using piu = await startPiu({
			script: { replies: [] },
			cwd: fixture.dir,
		});
		await piu.mockInput.typeText("Look at ./sam");
		await piu.waitForFrame((f) => f.includes("./sample.txt"));
		piu.mockInput.pressTab();
		await piu.waitForFrame((f) =>
			inputArea(f).includes("Look at ./sample.txt"),
		);
	} finally {
		fixture.removeDir();
	}
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
	await piu.waitForFrame((f) => working(f));
	await piu.mockInput.typeText(queued);
	queue(piu);
	await Bun.sleep(300);

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !working(f));
	const restored = await piu.waitForFrame((f) => inputArea(f).includes(queued));
	await Bun.sleep(500);
	await piu.renderOnce();
	expect(panelText(piu.captureCharFrame(), 10)).not.toContain(queued);
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
