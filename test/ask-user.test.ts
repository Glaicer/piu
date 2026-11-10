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
	const card = inputArea(frame);
	expect(card).toContain("Fruit");
	expect(card).toContain("Apple");
	expect(card).toContain("Crisp and red");
	expect(card).not.toContain("Working");
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

test("a question the card does not show yet reaches the model as not answered", async () => {
	const second = { ...fruitQuestion, question: "And for dessert?" };
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [
						{
							name: "ask_user",
							args: { questions: [fruitQuestion, second] },
						},
					],
				},
				"Model got {toolResult}",
			],
		},
	});
	await send(piu, "go");
	await piu.waitForFrame(showsCard);

	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) =>
		agentPanel(f).includes('"And for dessert?" = (not answered)'),
	);
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
	expect(cornerRows(asked)).toEqual([0, 20, 27]);

	piu.mockInput.pressEnter();
	const answered = await piu.waitForFrame((f) =>
		agentPanel(f).includes("Model got"),
	);
	expect(cornerRows(answered)).toEqual([0, 22, 27]);
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
