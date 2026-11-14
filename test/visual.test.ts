import { expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { glyphs, startPiu } from "./harness.ts";

for (const [mode, surface, ink, accent] of [
	["light", "#fbfafc", "#242936", "#3257b7"],
	["dark", "#1c202b", "#e5e9f5", "#a9bfff"],
] as const) {
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
		expect(prompt?.bg.equals(RGBA.fromHex(surface))).toBe(true);
		expect(badge?.fg.equals(RGBA.fromHex(surface))).toBe(true);
		expect(badge?.bg.equals(RGBA.fromHex(ink))).toBe(true);
		expect(frame.split("\n")[0]?.startsWith(glyphs.topLeft)).toBe(true);
		expect(frame).not.toContain("YOU");
		expect(frame).toContain("Thinking");
		expect(frame).not.toContain("Private reasoning");
		expect(spans.some((span) => span.fg.equals(RGBA.fromHex(accent)))).toBe(
			true,
		);
	});
}
