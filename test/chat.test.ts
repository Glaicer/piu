import { expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTreeSitterClient, RGBA } from "@opentui/core";
import { darkTheme } from "../src/theme.ts";
import { panelText, startPiu } from "./harness.ts";

const FAUX_CHARS_PER_TOKEN = 4;

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
		frame.includes("first item") &&
		frame.includes("second item") &&
		frame.includes("const answer: number = 42;") &&
		frame.includes("Done") &&
		!frame.includes("# ") &&
		!frame.includes("**") &&
		!frame.includes("`")
	);
}

function numberedLines(prefix: string, count: number) {
	return Array.from(
		{ length: count },
		(_, index) => `${prefix} ${String(index).padStart(3, "0")}`,
	).join("\n\n");
}

function spyOnHighlights() {
	const spy = spyOn(getTreeSitterClient(), "highlightOnce");
	return {
		contents: () => spy.mock.calls.map(([content]) => content),
		[Symbol.dispose]: () => spy.mockRestore(),
	};
}

const agentPanel = (frame: string) => panelText(frame, 10);
const sidePanel = (frame: string) => panelText(frame, 150);

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

test("a keyword in a code block is drawn in the keyword colour", async () => {
	await using piu = await startPiu({ script: { replies: [formatted] } });
	const keyword = RGBA.fromHex(darkTheme.accent);

	await piu.mockInput.typeText("Notes");
	piu.mockInput.pressEnter();

	await piu.waitForFrame(() =>
		piu
			.captureSpans()
			.lines.some((line) =>
				line.spans.some(
					(span) => span.text.trim() === "const" && span.fg.equals(keyword),
				),
			),
	);
});

test("the final frame of a streamed reply equals the same reply loaded in one chunk from the session", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-session-"));
	try {
		await using streamed = await startPiu({
			dir,
			persistSession: true,
			script: { replies: [formatted], tokenSize: 1 },
		});
		await streamed.mockInput.typeText("Notes");
		streamed.mockInput.pressEnter();
		await streamed.waitForFrame(isFormatted);

		await using loaded = await startPiu({
			dir,
			persistSession: true,
			script: { replies: [] },
			args: ["--model", "faux/faux-1", "-c"],
		});
		const oneChunk = await loaded.waitForFrame(isFormatted);

		await streamed.waitForFrame((frame) => frame === oneChunk);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("streaming a long reply highlights only the block that changed, never the whole reply", async () => {
	const paragraphCount = 400;
	const tokensPerDelta = 4;
	const charsPerDelta = tokensPerDelta * FAUX_CHARS_PER_TOKEN;
	const blockSeparator = "\n\n";
	const passesAfterGrowth = 4;
	const paragraphs = Array.from(
		{ length: paragraphCount },
		(_, index) =>
			`Paragraph ${String(index).padStart(3, "0")} talks about one small thing at a time.`,
	);
	const reply = paragraphs.join(blockSeparator);
	expect(reply.length).toBeGreaterThan(20_000);
	using highlights = spyOnHighlights();
	await using piu = await startPiu({
		script: { replies: [reply], tokenSize: tokensPerDelta },
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
		longestParagraph + blockSeparator.length,
	);
	const perParagraph = new Map<string, number>();
	for (const content of contents) {
		const id = /Paragraph (\d{3})/.exec(content)?.[1];
		if (id) perParagraph.set(id, (perParagraph.get(id) ?? 0) + 1);
	}
	const deltasWhileGrowing = Math.ceil(longestParagraph / charsPerDelta) + 1;
	expect(Math.max(...perParagraph.values())).toBeLessThanOrEqual(
		deltasWhileGrowing + passesAfterGrowth,
	);
}, 30_000);

const code = "const cached: string = 'highlight me once';";
const codeReply = `\`\`\`ts\n${code}\n\`\`\`\n\n${"More words after the code. ".repeat(20)}`;

test("a finished code block is highlighted once while later text streams after it", async () => {
	using highlights = spyOnHighlights();
	await using piu = await startPiu({
		script: { replies: [codeReply], tokenSize: 2 },
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

test("the agent Panel follows new output at the bottom and stays put when scrolled up", async () => {
	const wheelTicks = 5;
	const maxWheelTicks = 300;
	await using piu = await startPiu({
		script: {
			replies: [numberedLines("Line", 120), "Fresh reply", "Third reply"],
		},
		config: { placement: { side: ["chat.messages"] } },
	});

	await piu.mockInput.typeText("Lines");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Line 119"));

	for (let tick = 0; tick < wheelTicks; tick++)
		await piu.mockMouse.scroll(10, 5, "up");
	const scrolledUp = agentPanel(
		await piu.waitForFrame((frame) => !agentPanel(frame).includes("Line 119")),
	);
	await piu.mockInput.typeText("More");
	piu.mockInput.pressEnter();
	const arrived = await piu.waitForFrame((frame) =>
		sidePanel(frame).includes("Fresh reply"),
	);
	expect(agentPanel(arrived)).toEqual(scrolledUp);

	const backAtBottom = async () => {
		await piu.renderOnce();
		return agentPanel(piu.captureCharFrame()).includes("Fresh reply");
	};
	for (let tick = 0; tick < maxWheelTicks && !(await backAtBottom()); tick++)
		await piu.mockMouse.scroll(10, 5, "down");
	expect(await backAtBottom()).toBe(true);
	await piu.mockInput.typeText("Again");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Third reply"));
});

test("Ctrl+Home and Ctrl+End jump through chat and show a bottom hint when scrolled up", async () => {
	await using piu = await startPiu({
		script: { replies: [numberedLines("Line", 120)] },
	});
	await piu.mockInput.typeText("Lines");
	piu.mockInput.pressEnter();
	const bottom = await piu.waitForFrame((frame) =>
		agentPanel(frame).includes("Line 119"),
	);
	expect(agentPanel(bottom)).not.toContain("CTRL+End: jump to bottom");

	piu.mockInput.pressKey("HOME", { ctrl: true });
	const top = await piu.waitForFrame(
		(frame) =>
			agentPanel(frame).includes("Line 000") &&
			agentPanel(frame).includes("CTRL+End: jump to bottom"),
	);
	expect(agentPanel(top)).not.toContain("Line 119");

	piu.mockInput.pressKey("END", { ctrl: true });
	const end = await piu.waitForFrame(
		(frame) =>
			agentPanel(frame).includes("Line 119") &&
			!agentPanel(frame).includes("CTRL+End: jump to bottom"),
	);
	expect(agentPanel(end)).not.toContain("Line 000");
});

test("the bottom hint follows mouse scrolling", async () => {
	await using piu = await startPiu({
		script: { replies: [numberedLines("Line", 120)] },
	});
	await piu.mockInput.typeText("Lines");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Line 119"));
	await piu.mockMouse.scroll(10, 5, "up");
	await piu.waitForFrame((frame) =>
		agentPanel(frame).includes("CTRL+End: jump to bottom"),
	);
	await piu.mockMouse.scroll(10, 5, "down");
	await piu.waitForFrame(
		(frame) =>
			agentPanel(frame).includes("Line 119") &&
			!agentPanel(frame).includes("CTRL+End: jump to bottom"),
	);
});

test("a replaced layout keeps the chat following output in whichever Panel holds it", async () => {
	await using piu = await startPiu({
		script: { replies: [numberedLines("Row", 60)] },
		config: {
			layout: {
				kind: "container",
				id: "root",
				direction: "column",
				size: "rest",
				children: [
					{ kind: "panel", id: "talk", direction: "column", size: "rest" },
					{ kind: "panel", id: "typing", direction: "column", size: 3 },
				],
			},
			placement: { talk: ["chat.messages"], typing: ["input.prompt"] },
		},
	});

	await piu.mockInput.typeText("Rows");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => frame.includes("Row 059"));
});
