import { expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { darkTheme } from "../src/theme.ts";
import { inputArea, panelText, startPiu } from "./harness.ts";

test("the default side Panel is empty while the chat shows its welcome", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	const frame = await piu.waitForFrame(
		(frame) =>
			frame.includes("faux-1") &&
			frame.includes("What would you like to build?"),
	);
	expect(panelText(frame, 150).trim()).toBe("");
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
	expect(inputArea(frame).split("\n")).toHaveLength(6);
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
	).toBe("│ A plain prompt");

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
	).toBe("│ > A deliberate quote");
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
	const row = rows.findIndex((line) => line.includes("▸ bash"));
	expect(rows[row]).toMatch(/done\s+\d+(\.\d+)?m?s/);
	expect(rows[row - 1]).not.toContain("┌");
	expect(rows[row + 1]).not.toContain("└");
});

test("the model picker has a named rounded frame and a visible dismissal hint", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	piu.mockInput.pressKey("l", { ctrl: true });
	const frame = await piu.waitForFrame((frame) => frame.includes("faux-2"));
	expect(frame).toContain("╭─ Models ");
	expect(frame).toContain("Esc close");
	const corner = piu
		.captureSpans()
		.lines.flatMap((line) => line.spans)
		.find((span) => span.text.includes("╭"));
	expect(corner?.fg.equals(RGBA.fromHex(darkTheme.secondary))).toBe(true);
});
