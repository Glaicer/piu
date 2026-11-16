import { expect, test } from "bun:test";
import { panelText, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const chatPanel = (frame: string) => panelText(frame, 10, 0);
const modelLine = (frame: string) =>
	chatPanel(frame)
		.split("\n")
		.findLast((line) => line.trim())
		?.trim() ?? "";

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

test("the model line is the chat Panel's bottom row, with provider and reasoning", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	const frame = await piu.waitForFrame(
		(f) => f.includes("What would you like to build?") && f.includes("faux-1"),
	);
	expect(modelLine(frame)).toBe("faux · faux-1:no reasoning");
	expect(frame).not.toContain("Reasoning:");
});

test("the model line stays at the chat's bottom while messages scroll", async () => {
	const reply = Array.from({ length: 50 }, (_, at) => `Reply ${at}`).join(
		"\n\n",
	);
	await using piu = await startPiu({ script: { replies: [reply] }, width: 80 });
	await piu.waitForFrame((f) => f.includes("/ commands · @ files"));
	await send(piu, "Fill the conversation");
	const bottom = await piu.waitForFrame((f) => f.includes("Reply 49"));
	expect(modelLine(bottom)).toBe("faux · faux-1:no reasoning");
	piu.mockInput.pressKey("HOME", { ctrl: true });
	const top = await piu.waitForFrame((f) => chatPanel(f).includes("Reply 0"));
	expect(modelLine(top)).toBe("faux · faux-1:no reasoning");
});

test("switching the model and thinking level updates the model line", async () => {
	await using piu = await startPiu({
		script: { replies: [], switchCommands: true },
	});
	await piu.waitForFrame((f) => modelLine(f).includes("faux-1"));
	expect(modelLine(await piu.waitForFrame(() => true))).toBe(
		"faux · faux-1:no reasoning",
	);

	await send(piu, "/to-faux-2");
	await piu.waitForFrame((f) => modelLine(f).includes("faux-2"));

	await send(piu, "/level-high");
	const switched = await piu.waitForFrame((f) =>
		modelLine(f).includes(":high"),
	);
	expect(modelLine(switched)).toBe("faux · faux-2:high");
});

test("clicking the reasoning suffix opens the reasoning picker", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	const frame = await piu.waitForFrame((f) =>
		modelLine(f).includes("no reasoning"),
	);
	const line =
		frame.split("\n").find((text) => text.includes(":no reasoning")) ?? "";
	await piu.mockMouse.click(
		line.indexOf(":no reasoning") + 4,
		frame.split("\n").indexOf(line),
	);
	await piu.waitForFrame((f) =>
		f.split("\n").some((text) => /^\s+off\s+$/.test(text)),
	);
});
