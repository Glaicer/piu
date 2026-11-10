import { expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { inputArea, panelText, startPiu } from "./harness.ts";
import { probe } from "./probe.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;
type UiArgs = Record<string, string | number | string[]>;

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const agentPanel = (frame: string) => panelText(frame, 10, 0);

function raising(args: UiArgs) {
	return {
		uiTool: true,
		replies: [
			{ toolCalls: [{ name: "ui", args }] },
			"Extension got {toolResult}",
		],
	};
}

async function raise(args: UiArgs) {
	const piu = await startPiu({ script: raising(args) });
	await send(piu, "go");
	return piu;
}

const gotValue = (value: string) => `Extension got {"value":${value}}`;

test("a select dialog opens a Modal, and the chosen option reaches the extension", async () => {
	await using piu = await raise({
		method: "select",
		title: "Pick a fruit",
		options: ["Apple", "Banana", "Cherry"],
	});
	await piu.waitForFrame(
		(f) => f.includes("Pick a fruit") && f.includes("Cherry"),
	);

	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((f) =>
		agentPanel(f).includes(gotValue('"Banana"')),
	);
	expect(frame).not.toContain("Pick a fruit");
});

test("Esc on a select dialog gives the extension its cancelled value", async () => {
	await using piu = await raise({
		method: "select",
		title: "Pick a fruit",
		options: ["Apple", "Banana"],
	});
	await piu.waitForFrame((f) => f.includes("Pick a fruit"));

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => agentPanel(f).includes(gotValue("null")));
});

test("clicking outside a select dialog gives the extension its cancelled value", async () => {
	await using piu = await raise({
		method: "select",
		title: "Pick a fruit",
		options: ["Apple", "Banana"],
	});
	await piu.waitForFrame((f) => f.includes("Pick a fruit"));

	await piu.mockMouse.click(3, 3);
	await piu.waitForFrame((f) => agentPanel(f).includes(gotValue("null")));
});

function locate(frame: string, text: string) {
	const rows = frame.split("\n");
	const row = rows.findLastIndex((line) => line.includes(text));
	if (row < 0) throw new Error(`"${text}" is not in the frame:\n${frame}`);
	return { x: (rows[row] ?? "").indexOf(text) + 1, y: row };
}

test("a confirm dialog shows its message, and Enter on Yes tells the extension it was confirmed", async () => {
	await using piu = await raise({
		method: "confirm",
		title: "Clear session?",
		message: "All messages will be lost.",
	});
	await piu.waitForFrame(
		(f) => f.includes("Clear session?") && f.includes("All messages will be"),
	);

	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => agentPanel(f).includes(gotValue("true")));
});

test("clicking No on a confirm dialog tells the extension it was declined", async () => {
	await using piu = await raise({
		method: "confirm",
		title: "Clear session?",
		message: "All messages will be lost.",
	});
	const frame = await piu.waitForFrame((f) => f.includes("Clear session?"));

	const { x, y } = locate(frame, "No");
	await piu.mockMouse.click(x, y);
	await piu.waitForFrame((f) => agentPanel(f).includes(gotValue("false")));
});

test("an input dialog hands the typed text to the extension", async () => {
	await using piu = await raise({
		method: "input",
		title: "Enter a value",
		placeholder: "type something...",
	});
	await piu.waitForFrame(
		(f) => f.includes("Enter a value") && f.includes("type something..."),
	);

	await piu.mockInput.typeText("forty two");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) =>
		agentPanel(f).includes(gotValue('"forty two"')),
	);
});

test("an editor dialog opens with its prefill, and Shift+Enter adds a line to what the extension gets", async () => {
	await using piu = await raise({
		method: "editor",
		title: "Edit some text",
		prefill: "Line 1",
	});
	await piu.waitForFrame(
		(f) => f.includes("Edit some text") && f.includes("Line 1"),
	);

	piu.mockInput.pressEnter({ shift: true });
	await piu.mockInput.typeText("Line 2");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) =>
		agentPanel(f).includes(gotValue('"Line 1\\nLine 2"')),
	);
});

test("Esc on an input dialog gives the extension its cancelled value", async () => {
	await using piu = await raise({ method: "input", title: "Enter a value" });
	await piu.waitForFrame((f) => f.includes("Enter a value"));

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => agentPanel(f).includes(gotValue("null")));
});

test("notify shows a Toast that is gone after its timeout", async () => {
	await using piu = await raise({
		method: "notify",
		message: "Build finished",
	});
	await piu.waitForFrame((f) => f.includes("Build finished"));

	await piu.waitForFrame((f) => !f.includes("Build finished"), 6000);
});

const statusPanel = (frame: string) => {
	const lastRow = frame.trimEnd().split("\n").length - 1;
	return panelText(frame, 10, lastRow - 1);
};

test("setStatus text appears under the input and disappears when cleared", async () => {
	await using piu = await startPiu({
		script: {
			uiTool: true,
			replies: [
				{
					toolCalls: [
						{
							name: "ui",
							args: { method: "setStatus", key: "build", text: "Building 3/5" },
						},
					],
				},
				"Status set",
				{
					toolCalls: [
						{ name: "ui", args: { method: "setStatus", key: "build" } },
					],
				},
				"Status cleared",
			],
		},
	});
	await send(piu, "set");
	await piu.waitForFrame((f) => statusPanel(f).includes("Building 3/5"));

	await send(piu, "clear");
	await piu.waitForFrame(
		(f) =>
			agentPanel(f).includes("Status cleared") &&
			!statusPanel(f).includes("Building"),
	);
});

test("setTitle sets the terminal title", async () => {
	await using piu = await startPiu({
		script: raising({ method: "setTitle", title: "Deploying" }),
	});
	const setTitle = spyOn(piu.renderer, "setTerminalTitle").mockImplementation(
		() => {},
	);
	await send(piu, "go");
	await piu.waitForFrame((f) => agentPanel(f).includes("Extension got"));

	expect(setTitle).toHaveBeenCalledWith("Deploying");
});

test("set_editor_text puts the text in the input", async () => {
	await using piu = await raise({
		method: "setEditorText",
		text: "from the extension",
	});

	await piu.waitForFrame((f) => inputArea(f).includes("from the extension"));
});

test("a dialog still open when its tool call ends closes by itself, while the run goes on", async () => {
	await using piu = await startPiu({
		script: {
			uiTool: true,
			replies: [
				{
					toolCalls: [
						{
							name: "ui",
							args: {
								method: "abandon",
								title: "Stale question",
								options: ["A", "B"],
								ms: 500,
							},
						},
					],
				},
				{ toolCalls: [{ name: "bash", args: { command: "sleep 1.5" } }] },
				"Run finished",
			],
		},
	});
	await send(piu, "go");
	await piu.waitForFrame((f) => f.includes("Stale question"));

	await piu.waitForFrame(
		(f) => !f.includes("Stale question") && inputArea(f).includes("Working"),
	);
});

test("a dialog raised outside any tool call outlives the tools and closes when the run ends", async () => {
	await using piu = await startPiu({
		script: {
			uiTool: true,
			replies: [
				{
					toolCalls: [
						{
							name: "ui",
							args: { method: "later", title: "Late question", options: ["A"] },
						},
					],
				},
				{ toolCalls: [{ name: "bash", args: { command: "sleep 0.3" } }] },
				{ toolCalls: [{ name: "bash", args: { command: "sleep 0.9" } }] },
				"Run finished",
			],
		},
	});
	await send(piu, "go");
	await piu.waitForFrame(
		(f) => f.includes("Late question") && f.includes("sleep 0.9"),
	);

	await piu.waitForFrame(
		(f) =>
			agentPanel(f).includes("Run finished") && !f.includes("Late question"),
	);
});

test("a dialog raised by a tool that is then aborted disappears, and the run ends", async () => {
	await using piu = await startPiu({
		script: raising({
			method: "stubborn",
			title: "Doomed question",
			options: ["A", "B"],
		}),
		config: { placement: { status: ["probe.capture"] } },
		extensionsDir: join(import.meta.dir, "fixtures/extensions"),
	});
	await send(piu, "go");
	await piu.waitForFrame((f) => f.includes("Doomed question"));

	await probe.actions?.abort();
	await piu.waitForFrame(
		(f) => !f.includes("Doomed question") && !inputArea(f).includes("Working"),
	);
});

test("a new session drops the old session's statuses and keeps the ones its own start sets", async () => {
	await using piu = await startPiu({
		script: {
			uiTool: true,
			statusOnStart: "Booted",
			replies: [
				{
					toolCalls: [
						{
							name: "ui",
							args: { method: "setStatus", key: "build", text: "Building" },
						},
					],
				},
				"Status set",
			],
		},
	});
	await send(piu, "set");
	await piu.waitForFrame(
		(f) =>
			statusPanel(f).includes("Booted") && statusPanel(f).includes("Building"),
	);

	await send(piu, "/new");
	await piu.waitForFrame((f) => !agentPanel(f).includes("Status set"));
	const frame = await piu.waitForFrame((f) =>
		statusPanel(f).includes("Booted"),
	);
	expect(statusPanel(frame)).not.toContain("Building");
});

test("when Pi rejects a prompt, a Toast says why and the text stays in the input", async () => {
	await using piu = await startPiu({
		script: { replies: ["never sent"] },
		args: ["--model", "anthropic/claude-sonnet-4-5"],
	});
	await send(piu, "hello there");

	const frame = await piu.waitForFrame((f) =>
		f.includes("No API key found for anthropic"),
	);
	expect(inputArea(frame)).toContain("hello there");
	expect(frame).not.toContain("never sent");
});
