import { expect, test } from "bun:test";
import { join } from "node:path";
import { inputArea, panelText, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const installedAskUserQuestion = join(
	import.meta.dir,
	"fixtures/pi-extensions/ask-user-question.ts",
);

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const agentPanel = (frame: string) => panelText(frame, 10, 0);

const offeredTools = (frame: string) => {
	const text = agentPanel(frame)
		.split("\n")
		.map((line) => line.trim())
		.join("");
	return (/Tools: (\S+) end/.exec(text)?.[1] ?? "").split(",");
};

test("with an installed ask_user_question, the model is offered ask_user instead", async () => {
	await using piu = await startPiu({
		script: { replies: ["Tools: {tools} end"] },
		installedPiExtensions: [installedAskUserQuestion],
	});
	await send(piu, "go");

	const frame = await piu.waitForFrame((f) => offeredTools(f).includes("bash"));
	expect(offeredTools(frame)).toContain("ask_user");
	expect(offeredTools(frame)).not.toContain("ask_user_question");
});

const fruitQuestion = {
	question: "Which fruit do you want?",
	header: "Fruit",
	options: [
		{ label: "Apple", description: "Crisp and red" },
		{ label: "Banana", description: "Soft and yellow" },
	],
};

function asking(...after: string[]) {
	return {
		replies: [
			{
				toolCalls: [{ name: "ask_user", args: { questions: [fruitQuestion] } }],
			},
			...after,
		],
	};
}

const showsCard = (frame: string) =>
	inputArea(frame).includes("Which fruit do you want?") &&
	inputArea(frame).includes("Banana");

test("calling ask_user shows the question card in place of the input", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
		installedPiExtensions: [installedAskUserQuestion],
	});
	await send(piu, "go");

	const frame = await piu.waitForFrame(showsCard);
	const shown = inputArea(frame);
	expect(shown).toContain("Fruit");
	expect(shown).toContain("Apple");
	expect(shown).toContain("Crisp and red");
	expect(shown).not.toContain("Working");
	expect(frame).not.toContain("opentui:ask-user-question");
});

function locate(frame: string, text: string) {
	const rows = frame.split("\n");
	const row = rows.findLastIndex((line) => line.includes(text));
	if (row < 0) throw new Error(`"${text}" is not in the frame:\n${frame}`);
	return { x: (rows[row] ?? "").indexOf(text) + 1, y: row };
}

async function expectInputBack(piu: Piu) {
	await piu.mockInput.typeText("typing again");
	await piu.waitForFrame((f) => inputArea(f).includes("typing again"));
}

test("clicking an option sends it to the model, and the input comes back", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	const frame = await piu.waitForFrame(showsCard);

	const { x, y } = locate(frame, "Banana");
	await piu.mockMouse.click(x, y);
	await piu.waitForFrame((f) =>
		agentPanel(f).includes('Model got "Which fruit do you want?" = "Banana"'),
	);
	await expectInputBack(piu);
});

test("picking an option with the arrow keys and Enter sends it to the model", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);

	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) =>
		agentPanel(f).includes('Model got "Which fruit do you want?" = "Banana"'),
	);
	await expectInputBack(piu);
});

test("Tab takes the focus away from the question card and a full cycle brings the card its keys back", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);

	piu.mockInput.pressTab();
	await piu.waitForFrame((f) => /┌─ agent /.test(f));
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressTab();
	await piu.waitForFrame((f) => /┌─ input /.test(f));
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) =>
		agentPanel(f).includes('Model got "Which fruit do you want?" = "Banana"'),
	);
});

const colorQuestion = {
	question: "Which colors do you like?",
	header: "Colors",
	multiSelect: true,
	options: [{ label: "Red" }, { label: "Green" }, { label: "Blue" }],
};

const sizeQuestion = {
	question: "How big should it be?",
	header: "Size",
	options: [{ label: "Small" }, { label: "Large" }],
};

function askingThree(...after: string[]) {
	return {
		replies: [
			{
				toolCalls: [
					{
						name: "ask_user",
						args: { questions: [fruitQuestion, colorQuestion, sizeQuestion] },
					},
				],
			},
			...after,
		],
	};
}

test("three questions show three tabs, and switching tabs keeps unsent choices", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	const first = await piu.waitForFrame(showsCard);
	for (const header of ["Fruit", "Colors", "Size", "Review"]) {
		expect(inputArea(first)).toContain(header);
	}

	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) =>
		inputArea(f).includes("Which colors do you like?"),
	);

	piu.mockInput.pressArrow("left");
	const back = await piu.waitForFrame(showsCard);
	expect(inputArea(back)).toContain("(x) Banana");
	expect(inputArea(back)).toContain("( ) Apple");
});

const modelGot = (frame: string, text: string) =>
	agentPanel(frame)
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.includes(`Model got ${text}`);

const answersOf = (...lines: string[]) => lines.join("\n");

async function click(
	piu: Piu,
	text: string,
	after?: (frame: string) => boolean,
) {
	const frame = await piu.waitForFrame(
		(f) => inputArea(f).includes(text) && (after?.(f) ?? true),
	);
	const { x, y } = locate(frame, text);
	await piu.mockMouse.click(x, y);
}

const pointsAt = (text: string) => (frame: string) =>
	inputArea(frame)
		.split("\n")
		.some((line) => line.includes("▸") && line.includes(text));

const onQuestion = (text: string) => (frame: string) =>
	inputArea(frame).includes(text);

test("answering every question and submitting from Review sends all answers (keyboard)", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);

	piu.mockInput.pressEnter();
	await piu.waitForFrame(onQuestion("Which colors do you like?"));
	piu.mockInput.pressKey(" ");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(onQuestion("How big should it be?"));
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();

	const review = await piu.waitForFrame(onQuestion("Review your answers"));
	expect(inputArea(review)).toContain("Fruit: Apple");
	expect(inputArea(review)).toContain("Colors: Red");
	expect(inputArea(review)).toContain("Size: Large");
	for (let i = 0; i < 3; i++) piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) =>
		modelGot(
			f,
			answersOf(
				'"Which fruit do you want?" = "Apple"',
				'"Which colors do you like?" = "Red"',
				'"How big should it be?" = "Large"',
			),
		),
	);
	await expectInputBack(piu);
});

test("answering every question and submitting from Review sends all answers (mouse)", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	await click(piu, "Banana");
	await click(piu, "Green", onQuestion("Which colors do you like?"));
	await click(piu, "Blue");
	await click(piu, "Review");
	await click(piu, "Submit", onQuestion("Review your answers"));

	await piu.waitForFrame((f) =>
		modelGot(
			f,
			answersOf(
				'"Which fruit do you want?" = "Banana"',
				'"Which colors do you like?" = "Green, Blue"',
				'"How big should it be?" = (not answered)',
			),
		),
	);
});

test("a multi-select question toggles options on and off, and the model gets all that stay on", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [
						{ name: "ask_user", args: { questions: [colorQuestion] } },
					],
				},
				"Model got {toolResult}",
			],
		},
	});
	await send(piu, "go");
	await piu.waitForFrame(onQuestion("Which colors do you like?"));

	piu.mockInput.pressKey(" ");
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressKey(" ");
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressKey(" ");
	const toggled = await piu.waitForFrame((f) =>
		inputArea(f).includes("[x] Blue"),
	);
	expect(inputArea(toggled)).toContain("[x] Red");
	expect(inputArea(toggled)).toContain("[x] Green");

	piu.mockInput.pressKey(" ");
	await piu.waitForFrame((f) => inputArea(f).includes("[ ] Blue"));
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) =>
		modelGot(f, '"Which colors do you like?" = "Red, Green"'),
	);
});

test("clicking options of a multi-select question toggles them", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [
						{ name: "ask_user", args: { questions: [colorQuestion] } },
					],
				},
				"Model got {toolResult}",
			],
		},
	});
	await send(piu, "go");
	await click(piu, "Blue");
	await click(piu, "Red", (f) => inputArea(f).includes("[x] Blue"));
	await piu.waitForFrame((f) => inputArea(f).includes("[x] Red"));
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) =>
		modelGot(f, '"Which colors do you like?" = "Red, Blue"'),
	);
});

test("typing a custom answer sends it instead of an option (keyboard)", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);

	piu.mockInput.pressArrow("down");
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(pointsAt("Type your own answer"));
	await piu.mockInput.typeText("Pear");
	await piu.waitForFrame((f) => inputArea(f).includes("Pear"));
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) =>
		modelGot(f, '"Which fruit do you want?" = "Pear"'),
	);
});

test("clicking the custom answer field and typing sends the text (mouse)", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	await click(piu, "Type your own answer");
	await piu.mockInput.typeText("Plum");
	await piu.waitForFrame((f) => inputArea(f).includes("Plum"));
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) =>
		modelGot(f, '"Which fruit do you want?" = "Plum"'),
	);
});

test("choosing an option after typing a custom answer replaces the typed text", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(pointsAt("Type your own answer"));
	await piu.mockInput.typeText("Pear");
	await piu.waitForFrame((f) => inputArea(f).includes("Pear"));
	piu.mockInput.pressArrow("up");
	piu.mockInput.pressArrow("up");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(onQuestion("Which colors do you like?"));
	piu.mockInput.pressArrow("left");

	const back = await piu.waitForFrame(showsCard);
	expect(inputArea(back)).toContain("( ) Banana");
	expect(inputArea(back)).toContain("(x) Apple");
	expect(inputArea(back)).not.toContain("Pear");
});

test("changing an answer from Review is what the model receives (keyboard)", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);
	piu.mockInput.pressEnter();
	await piu.waitForFrame(onQuestion("Which colors do you like?"));
	piu.mockInput.pressKey(" ");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(onQuestion("How big should it be?"));
	piu.mockInput.pressEnter();
	const review = await piu.waitForFrame(onQuestion("Review your answers"));
	expect(inputArea(review)).toContain("Colors: Red");

	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(onQuestion("Which colors do you like?"));
	piu.mockInput.pressKey(" ");
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressKey(" ");
	piu.mockInput.pressEnter();
	const changed = await piu.waitForFrame(onQuestion("Review your answers"));
	expect(inputArea(changed)).toContain("Colors: Green");
	for (let i = 0; i < 3; i++) piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) =>
		modelGot(
			f,
			answersOf(
				'"Which fruit do you want?" = "Apple"',
				'"Which colors do you like?" = "Green"',
				'"How big should it be?" = "Small"',
			),
		),
	);
});

test("changing an answer from Review is what the model receives (mouse)", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	await click(piu, "Apple");
	await click(piu, "Red", onQuestion("Which colors do you like?"));
	await click(piu, "Review");
	await click(piu, "Fruit: Apple", onQuestion("Review your answers"));
	await click(piu, "Banana", onQuestion("Which fruit do you want?"));
	await click(piu, "Submit", onQuestion("Review your answers"));

	await piu.waitForFrame((f) =>
		modelGot(
			f,
			answersOf(
				'"Which fruit do you want?" = "Banana"',
				'"Which colors do you like?" = "Red"',
				'"How big should it be?" = (not answered)',
			),
		),
	);
});

test("Left and Right move between question tabs", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);

	piu.mockInput.pressArrow("right");
	await piu.waitForFrame(onQuestion("Which colors do you like?"));
	piu.mockInput.pressArrow("left");
	await piu.waitForFrame(showsCard);
});

test("a custom answer stays with its own question when switching tabs", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(pointsAt("Type your own answer"));
	await piu.mockInput.typeText("Pear");
	await piu.waitForFrame((f) => inputArea(f).includes("Pear"));
	piu.mockInput.pressArrow("up");
	piu.mockInput.pressArrow("right");

	const colors = await piu.waitForFrame(
		onQuestion("Which colors do you like?"),
	);
	expect(inputArea(colors)).toContain("Type your own answer");
	expect(inputArea(colors)).not.toContain("Pear");

	piu.mockInput.pressArrow("left");
	const back = await piu.waitForFrame(showsCard);
	expect(inputArea(back)).toContain("(x) Pear");
	piu.mockInput.pressArrow("right");
	piu.mockInput.pressArrow("right");
	piu.mockInput.pressArrow("right");
	const review = await piu.waitForFrame(onQuestion("Review your answers"));
	expect(inputArea(review)).toContain("Fruit: Pear");
});

test("after changing an answer from Review, leaving that question by arrow keys does not send the next Enter back to Review", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);
	piu.mockInput.pressArrow("right");
	piu.mockInput.pressArrow("right");
	piu.mockInput.pressArrow("right");
	await piu.waitForFrame(onQuestion("Review your answers"));
	piu.mockInput.pressEnter();
	await piu.waitForFrame(showsCard);
	piu.mockInput.pressArrow("right");
	await piu.waitForFrame(onQuestion("Which colors do you like?"));
	piu.mockInput.pressEnter();

	await piu.waitForFrame(onQuestion("How big should it be?"));
});

const declined = "Model got The user declined to answer the questions.";

test("Esc dismisses the card, and the model gets a declined result", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => agentPanel(f).includes(declined));
	await expectInputBack(piu);
});

test("clicking Dismiss gives the model a declined result", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	const frame = await piu.waitForFrame(showsCard);

	const { x, y } = locate(frame, "Dismiss");
	await piu.mockMouse.click(x, y);
	await piu.waitForFrame((f) => agentPanel(f).includes(declined));
});

const cornerRows = (frame: string) =>
	frame
		.split("\n")
		.flatMap((line, index) => (line.startsWith("┌") ? [index] : []));

test("the input Panel grows to fit the card and returns to the input's height after", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	const idle = await piu.waitForFrame((f) => f.includes("faux-1"));
	expect(cornerRows(idle)).toEqual([0, 22, 27]);
	await send(piu, "go");
	const asked = await piu.waitForFrame(showsCard);
	expect(cornerRows(asked)).toEqual([0, 19, 27]);

	piu.mockInput.pressEnter();
	const answered = await piu.waitForFrame((f) =>
		agentPanel(f).includes("Model got"),
	);
	expect(cornerRows(answered)).toEqual([0, 22, 27]);
});

test("ask_user_question stays out after a tool call and in the next run", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{ toolCalls: [{ name: "bash", args: { command: "true" } }] },
				"Tools: {tools} end",
				"Tools: {tools} end",
			],
		},
		installedPiExtensions: [installedAskUserQuestion],
	});
	await send(piu, "first");
	const afterTool = await piu.waitForFrame((f) =>
		offeredTools(f).includes("bash"),
	);
	expect(offeredTools(afterTool)).toContain("ask_user");
	expect(offeredTools(afterTool)).not.toContain("ask_user_question");

	await send(piu, "second");
	const nextRun = await piu.waitForFrame(
		(f) =>
			agentPanel(f).includes("second") &&
			agentPanel(f).split("Tools: ").length === 3,
	);
	const [, second = ""] =
		agentPanel(nextRun)
			.split("\n")
			.map((line) => line.trim())
			.join("")
			.match(/Tools: \S+ end/g) ?? [];
	const tools = second.slice("Tools: ".length, -" end".length).split(",");
	expect(tools).toContain("ask_user");
	expect(tools).not.toContain("ask_user_question");
});

test("without its Module in the Placement, the Extension's Pi extension is not loaded", async () => {
	await using piu = await startPiu({
		script: { replies: ["Tools: {tools} end"] },
		installedPiExtensions: [installedAskUserQuestion],
		config: { placement: { input: ["input.prompt"] } },
	});
	await send(piu, "go");

	const frame = await piu.waitForFrame((f) => offeredTools(f).includes("bash"));
	expect(offeredTools(frame)).toContain("ask_user_question");
	expect(offeredTools(frame)).not.toContain("ask_user");
});

test("Esc inside the custom answer field dismisses the card", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(pointsAt("Type your own answer"));
	await piu.mockInput.typeText("Pe");
	piu.mockInput.pressEscape();

	await piu.waitForFrame((f) => agentPanel(f).includes(declined));
});

test("Enter on an empty custom answer field sends nothing", async () => {
	await using piu = await startPiu({
		script: asking("Model got {toolResult}"),
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(pointsAt("Type your own answer"));
	piu.mockInput.pressEnter();
	await Bun.sleep(300);
	piu.mockInput.pressEscape();

	await piu.waitForFrame((f) => agentPanel(f).includes(declined));
});

const manyOptions = {
	question: "Which letter do you want?",
	header: "Letter",
	options: Array.from({ length: 4 }, (_, i) => ({
		label: `Letter ${String.fromCharCode(65 + i)}`,
	})),
};

test("in a terminal shorter than the card, the card scrolls to the selected row and keeps Dismiss in view", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [{ name: "ask_user", args: { questions: [manyOptions] } }],
				},
				"Model got {toolResult}",
			],
		},
		height: 10,
	});
	await send(piu, "go");
	const first = await piu.waitForFrame((f) =>
		inputArea(f).includes("Letter A"),
	);
	expect(inputArea(first)).not.toContain("Type your own answer");
	expect(inputArea(first)).toContain("Dismiss (Esc)");

	for (let i = 0; i < 4; i++) piu.mockInput.pressArrow("down");

	const last = await piu.waitForFrame((f) =>
		inputArea(f).includes("Type your own answer"),
	);
	expect(inputArea(last)).not.toContain("Letter A");
	expect(inputArea(last)).toContain("Dismiss (Esc)");
});

test("in a short terminal Review's Submit can be reached and pressed", async () => {
	await using piu = await startPiu({
		script: askingThree("Model got {toolResult}"),
		height: 10,
	});
	await send(piu, "go");
	await piu.waitForFrame(onQuestion("Which fruit do you want?"));
	piu.mockInput.pressArrow("right");
	await piu.waitForFrame(onQuestion("Which colors do you like?"));
	piu.mockInput.pressArrow("right");
	await piu.waitForFrame(onQuestion("How big should it be?"));
	piu.mockInput.pressArrow("right");
	await piu.waitForFrame(onQuestion("Review your answers"));

	for (let i = 0; i < 3; i++) piu.mockInput.pressArrow("down");

	await piu.waitForFrame((f) => inputArea(f).includes("Submit"));
	piu.mockInput.pressEnter();
	piu.resize(160, 30);
	await piu.waitForFrame((f) => agentPanel(f).includes("Model got"));
});
