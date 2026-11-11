import { expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { darkTheme, lightTheme } from "../src/theme.ts";
import { startPiu } from "./harness.ts";

const none = { replies: [] };

async function userEcho(piu: Awaited<ReturnType<typeof startPiu>>) {
	await piu.mockInput.typeText("Hi");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((frame) => frame.includes("> Hi"));
	return piu
		.captureSpans()
		.lines.flatMap((line) => line.spans)
		.find((span) => span.text.includes("> Hi"));
}

test("a terminal reporting a dark background gets the dark tokens", async () => {
	await using piu = await startPiu({
		script: { replies: ["ok"] },
		terminalBackground: "dark",
	});

	const span = await userEcho(piu);

	expect(span?.fg.equals(RGBA.fromHex(darkTheme.accent))).toBe(true);
	expect(span?.bg.equals(RGBA.fromHex(darkTheme.surface))).toBe(true);
});

test("a terminal reporting a light background gets the light tokens", async () => {
	await using piu = await startPiu({
		script: { replies: ["ok"] },
		terminalBackground: "light",
	});

	const span = await userEcho(piu);

	expect(span?.fg.equals(RGBA.fromHex(lightTheme.accent))).toBe(true);
	expect(span?.bg.equals(RGBA.fromHex(lightTheme.surface))).toBe(true);
});

test("a terminal that changes its background mid-session switches the tokens", async () => {
	await using piu = await startPiu({
		script: { replies: ["ok"] },
		terminalBackground: "dark",
	});
	await userEcho(piu);

	piu.reportTerminalBackground("light");
	await piu.waitForFrame(() =>
		piu
			.captureSpans()
			.lines.flatMap((line) => line.spans)
			.some(
				(span) =>
					span.text.includes("> Hi") &&
					span.fg.equals(RGBA.fromHex(lightTheme.accent)),
			),
	);
});

test("a terminal that reports nothing gets the dark tokens", async () => {
	await using piu = await startPiu({ script: { replies: ["ok"] } });

	const span = await userEcho(piu);

	expect(span?.fg.equals(RGBA.fromHex(darkTheme.accent))).toBe(true);
});

for (const mode of ["dark", "light"] as const) {
	test(`an accent override in config.json changes the accent on a ${mode} terminal`, async () => {
		await using piu = await startPiu({
			script: { replies: ["ok"] },
			terminalBackground: mode,
			config: { theme: { accent: "#ff00ff" } },
		});

		const span = await userEcho(piu);

		expect(span?.fg.equals(RGBA.fromHex("#ff00ff"))).toBe(true);
	});
}

test("an override leaves the other tokens of the active theme alone", async () => {
	await using piu = await startPiu({
		script: { replies: ["ok"] },
		terminalBackground: "light",
		config: { theme: { accent: "#ff00ff" } },
	});

	const span = await userEcho(piu);

	expect(span?.bg.equals(RGBA.fromHex(lightTheme.surface))).toBe(true);
});

test("a code keyword is drawn in the accent of the theme the terminal asked for", async () => {
	const reply = "```ts\nconst answer = 42;\n```";
	await using piu = await startPiu({
		script: { replies: [reply] },
		terminalBackground: "light",
	});
	const keyword = RGBA.fromHex(lightTheme.accent);

	await piu.mockInput.typeText("Code");
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

test("an unknown token name in config is a startup error with the field path", async () => {
	await expect(
		startPiu({ script: none, config: { theme: { acent: "#ff00ff" } } }),
	).rejects.toThrow("theme.acent");
});

test("a token value that is not a hex color is a startup error with the field path", async () => {
	await expect(
		startPiu({ script: none, config: { theme: { accent: "blu" } } }),
	).rejects.toThrow("theme.accent");
});

test("code already on screen is redrawn in the new accent when the terminal switches background", async () => {
	const reply = "```ts\nconst answer = 42;\n```";
	await using piu = await startPiu({
		script: { replies: [reply] },
		terminalBackground: "dark",
	});
	const keywordIs = (hex: string) => () =>
		piu
			.captureSpans()
			.lines.some((line) =>
				line.spans.some(
					(span) =>
						span.text.trim() === "const" && span.fg.equals(RGBA.fromHex(hex)),
				),
			);

	await piu.mockInput.typeText("Code");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(keywordIs(darkTheme.accent));

	piu.reportTerminalBackground("light");
	await piu.waitForFrame(keywordIs(lightTheme.accent));
});
