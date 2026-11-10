import { expect, spyOn, test } from "bun:test";
import { getTreeSitterClient } from "@opentui/core";
import { startPiu } from "./harness.ts";

const formatted = [
	"# Release notes",
	"",
	"Some **bold** words and `inline code`.",
	"",
	"- first item",
	"- second item",
	"",
	"| Name | Value |",
	"| ---- | ----- |",
	"| alpha | 1 |",
	"",
	"```ts",
	"const answer: number = 42;",
	"```",
	"",
	"## Done",
].join("\n");

function isFormatted(frame: string) {
	return (
		frame.includes("Release notes") &&
		frame.includes("Done") &&
		!frame.includes("# ") &&
		!frame.includes("**") &&
		!frame.includes("`")
	);
}

function spyOnHighlights() {
	const spy = spyOn(getTreeSitterClient(), "highlightOnce");
	return {
		contents: () => spy.mock.calls.map(([content]) => content),
		[Symbol.dispose]: () => spy.mockRestore(),
	};
}

test("a reply with headings, lists, a table and code renders without raw Markdown markers", async () => {
	await using piu = await startPiu({ script: { replies: [formatted] } });

	await piu.mockInput.typeText("Notes");
	piu.mockInput.pressEnter();

	const frame = await piu.waitForFrame(isFormatted);
	expect(frame).toContain("Some bold words and inline code.");
	expect(frame).toContain("first item");
	expect(frame).toMatch(/│\s*Name\s*│\s*Value\s*│/);
	expect(frame).not.toContain("| ----");
	expect(frame).toContain("const answer: number = 42;");
});

test("the final frame of a streamed reply equals the same reply delivered in one chunk", async () => {
	let oneChunk: string;
	{
		await using piu = await startPiu({
			script: { replies: [formatted], tokenSize: 100_000 },
		});
		await piu.mockInput.typeText("Notes");
		piu.mockInput.pressEnter();
		oneChunk = await piu.waitForFrame(isFormatted);
	}

	await using piu = await startPiu({
		script: { replies: [formatted], tokenSize: 1 },
	});
	await piu.mockInput.typeText("Notes");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => frame === oneChunk);
});

test("streaming a long reply highlights only the block that changed, never the whole reply", async () => {
	const paragraphs = Array.from(
		{ length: 400 },
		(_, index) =>
			`Paragraph ${String(index).padStart(3, "0")} talks about one small thing at a time.`,
	);
	const reply = paragraphs.join("\n\n");
	expect(reply.length).toBeGreaterThan(20_000);
	using highlights = spyOnHighlights();
	await using piu = await startPiu({
		script: { replies: [reply], tokenSize: 4 },
	});

	await piu.mockInput.typeText("Go on");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(frame) => frame.includes("Paragraph 399 talks"),
		20_000,
	);

	const longestParagraph = Math.max(...paragraphs.map((p) => p.length));
	const contents = highlights.contents();
	expect(Math.max(...contents.map((c) => c.length))).toBeLessThanOrEqual(
		longestParagraph + 2,
	);
	const perParagraph = new Map<string, number>();
	for (const content of contents) {
		const id = /Paragraph (\d{3})/.exec(content)?.[1];
		if (id) perParagraph.set(id, (perParagraph.get(id) ?? 0) + 1);
	}
	const deltasPerParagraph = Math.ceil(longestParagraph / 16) + 2;
	expect(Math.max(...perParagraph.values())).toBeLessThanOrEqual(
		deltasPerParagraph + 2,
	);
}, 30_000);

test("a finished code block is highlighted once while later text streams after it", async () => {
	const code = "const cached: string = 'highlight me once';";
	const reply = `\`\`\`ts\n${code}\n\`\`\`\n\n${"More words after the code. ".repeat(20)}`;
	using highlights = spyOnHighlights();
	await using piu = await startPiu({
		script: { replies: [reply], tokenSize: 2 },
	});

	await piu.mockInput.typeText("Code");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(frame) => frame.includes("code.") && !frame.includes("```"),
	);
	await piu.renderOnce();

	const codeHighlights = highlights
		.contents()
		.filter((content) => content.trim() === code);
	expect(codeHighlights).toHaveLength(1);
});

function agentRows(frame: string) {
	return frame
		.split("\n")
		.slice(0, 20)
		.map((line) => line.slice(0, 80));
}

test("the agent Panel follows new output at the bottom and stays put when scrolled up", async () => {
	const lines = Array.from(
		{ length: 120 },
		(_, index) => `Line ${String(index).padStart(3, "0")}`,
	);
	await using piu = await startPiu({
		script: {
			replies: [lines.join("\n\n")],
			tokensPerSecond: 60,
			tokenSize: 1,
		},
	});

	await piu.mockInput.typeText("Lines");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((frame) => frame.includes("Line 020"), 10_000);
	const following = await piu.waitForFrame(
		(frame) => frame.includes("Line 030"),
		10_000,
	);
	expect(following).not.toContain("> Lines");

	for (let tick = 0; tick < 5; tick++) await piu.mockMouse.scroll(10, 5, "up");
	await piu.renderOnce();
	const scrolledUp = agentRows(piu.captureCharFrame());
	await Bun.sleep(400);
	await piu.renderOnce();
	expect(agentRows(piu.captureCharFrame())).toEqual(scrolledUp);

	for (let tick = 0; tick < 100; tick++)
		await piu.mockMouse.scroll(10, 5, "down");
	await piu.waitForFrame((frame) => frame.includes("Line 119"), 20_000);
}, 30_000);
