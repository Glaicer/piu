import { expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { darkTheme } from "../src/theme.ts";
import {
	glyphs,
	inputArea,
	messageBar,
	modalTitle,
	onModalFill,
	panelBoxes,
	panelText,
	startPiu,
} from "./harness.ts";

test("the default side Panel is hidden while the chat shows its welcome", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	const frame = await piu.waitForFrame(
		(frame) =>
			frame.includes("faux-1") &&
			frame.includes("What would you like to build?"),
	);
	expect(panelBoxes(piu).map((box) => box.id)).not.toContain("side");
	const rows = panelText(frame, 10).split("\n");
	const heading = rows.findIndex((line) =>
		line.includes("What would you like to build?"),
	);
	expect(rows[heading + 1]?.trim()).toBe(
		"Ask a question, describe a change, or share an idea.",
	);
	expect(frame).not.toContain(
		"Your workspace is ready. Start with a prompt below.",
	);
});

test("the idle composer shows command and file hints followed by its directory", async () => {
	await using piu = await startPiu({ script: { replies: [] }, width: 80 });
	const frame = await piu.waitForFrame(
		(frame) =>
			frame.includes("faux-1") &&
			inputArea(frame).includes("/ commands · @ files") &&
			inputArea(frame).includes(piu.dir),
	);
	expect(
		inputArea(frame)
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
	).toEqual(["/ commands · @ files", piu.dir]);
	expect(inputArea(frame).split("\n")).toHaveLength(5);
});

test("user messages have no added prompt marker and preserve a typed greater-than sign", async () => {
	await using piu = await startPiu({
		script: { replies: ["First reply", "Second reply"] },
	});
	await piu.mockInput.typeText("A plain prompt");
	piu.mockInput.pressEnter();
	const first = await piu.waitForFrame((frame) =>
		frame.includes("First reply"),
	);
	expect(
		panelText(first, 10)
			.split("\n")
			.find((line) => line.includes("A plain prompt"))
			?.trim(),
	).toBe(messageBar("A plain prompt").trim());

	await piu.mockInput.typeText("> A deliberate quote");
	piu.mockInput.pressEnter();
	const second = await piu.waitForFrame((frame) =>
		frame.includes("Second reply"),
	);
	expect(
		panelText(second, 10)
			.split("\n")
			.find((line) => line.includes("A deliberate quote"))
			?.trim(),
	).toBe(messageBar("> A deliberate quote").trim());
});

test("a user message and an opened tool card body stand out from the Panel with a raised fill", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [{ name: "bash", args: { command: "printf RES%s ULT" } }],
				},
				"All done",
			],
		},
	});
	await piu.mockInput.typeText("Shade me");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((f) => f.includes("All done"));
	const raised = RGBA.fromHex(darkTheme.raised);
	const bgOf = (needle: string) =>
		piu
			.captureSpans()
			.lines.flatMap((line) => line.spans)
			.find((span) => span.text.includes(needle))?.bg;
	expect(bgOf("Shade me")?.equals(raised)).toBe(true);

	const rows = frame.split("\n");
	const row = rows.findIndex((line) => line.includes(" bash "));
	await piu.mockMouse.click((rows[row] ?? "").indexOf(" bash ") + 1, row);
	await piu.waitForFrame((f) => f.includes("RESULT"));
	expect(bgOf("RESULT")?.equals(raised)).toBe(true);
});

test("a compact tool row keeps its status visible next to a long command on a narrow terminal", async () => {
	await using piu = await startPiu({
		width: 64,
		script: {
			replies: [
				{
					toolCalls: [
						{
							name: "bash",
							args: { command: `printf '%s' '${"long ".repeat(25)}'` },
						},
					],
				},
				"Finished cleanly",
			],
		},
	});
	await piu.mockInput.typeText("Run this");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((frame) =>
		frame.includes("Finished cleanly"),
	);
	const rows = panelText(frame, 10).split("\n");
	const row = rows.findIndex((line) => line.includes(" bash"));
	expect(rows[row]).toMatch(/done\s+\d+(\.\d+)?m?s/);
	expect(rows[row - 1]).not.toContain(glyphs.topLeft);
	expect(rows[row + 1]).not.toContain(glyphs.bottomLeft);
});

test("the model picker is a raised Card with its name and a visible dismissal hint", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	piu.mockInput.pressKey("l", { ctrl: true });
	const frame = await piu.waitForFrame((frame) => frame.includes("faux-2"));
	expect(frame).toContain(modalTitle("Models"));
	expect(frame).toContain("Esc close");
	const rows = frame.split("\n");
	const top = rows.findIndex((line) => line.includes(modalTitle("Models")));
	const left = (rows[top] ?? "").indexOf(modalTitle("Models")) - 2;
	expect(onModalFill(piu, left, top)).toBe(true);
	expect(onModalFill(piu, left, top - 1)).toBe(true);
	expect(rows[top - 1]?.slice(left, left + 20).trim()).toBe("");
	expect(rows[top]?.[left]).toBe(" ");
	expect(rows[top + 1]?.[left]).toBe(" ");
	const title = piu
		.captureSpans()
		.lines.flatMap((line) => line.spans)
		.find((span) => span.text.includes("Models"));
	expect(title?.bg.equals(RGBA.fromHex(darkTheme.raised))).toBe(true);
});
