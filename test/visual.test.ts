import { expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { focusedPanels, glyphs, sidePlacement, startPiu } from "./harness.ts";

for (const [mode, surface, raised, ink] of [
	["light", "#ffffff", "#f2f2f2", "#000000"],
	["dark", "#1c202b", "#252b39", "#e5e9f5"],
] as const) {
	test(`thin Panel dividers stay one neutral color when focus changes on a ${mode} terminal`, async () => {
		await using piu = await startPiu({
			terminalBackground: mode,
			script: { replies: [] },
			config: {
				placement: sidePlacement,
			},
		});
		await piu.waitForFrame(
			(frame) =>
				frame.includes("faux-1") && frame.includes("/ commands · @ files"),
		);
		const border = RGBA.fromHex(mode === "light" ? "#e3e3e3" : "#46516b");
		const checkBorders = () => {
			const outlines = piu
				.captureSpans()
				.lines.flatMap((line) =>
					line.spans.filter(
						(span) =>
							span.text.includes(glyphs.rule) ||
							span.text.includes(glyphs.divider),
					),
				);
			expect(outlines.length).toBeGreaterThan(0);
			expect(outlines.every((span) => span.fg.equals(border))).toBe(true);
		};
		checkBorders();
		piu.mockInput.pressTab();
		await piu.waitForFrame(
			(frame) => focusedPanels(piu, frame).join() === "agent",
		);
		checkBorders();
	});

	test(`Blueprint frames and Signal tool labels on a ${mode} terminal`, async () => {
		await using piu = await startPiu({
			terminalBackground: mode,
			script: {
				replies: [
					{
						thinking: "Private reasoning",
						toolCalls: [
							{ name: "bash", args: { command: "echo visual-check" } },
						],
					},
					"Visual answer",
				],
			},
		});
		await piu.mockInput.typeText("Visual prompt");
		piu.mockInput.pressEnter();
		const frame = await piu.waitForFrame((f) => f.includes("Visual answer"));
		const spans = piu.captureSpans().lines.flatMap((line) => line.spans);
		const prompt = spans.find((span) => span.text.trim() === "Visual prompt");
		const badge = spans.find((span) => span.text.trim() === "bash");
		expect(prompt?.fg.equals(RGBA.fromHex(ink))).toBe(true);
		expect(prompt?.bg.equals(RGBA.fromHex(raised))).toBe(true);
		expect(badge?.fg.equals(RGBA.fromHex(surface))).toBe(true);
		expect(badge?.bg.equals(RGBA.fromHex(ink))).toBe(true);
		expect(frame).not.toContain(glyphs.topLeft);
		expect(frame).not.toContain("YOU");
		expect(frame).toContain("Thinking");
		expect(frame).not.toContain("Private reasoning");
	});
}
