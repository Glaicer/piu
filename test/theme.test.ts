import { expect, test } from "bun:test";
import { RGBA, TextAttributes } from "@opentui/core";
import { darkTheme, lightTheme, type Theme } from "../src/theme.ts";
import { startPiu } from "./harness.ts";

const none = { replies: [] };

for (const mode of ["light", "dark"] as const) {
	test(`the cursor follows the ${mode} theme: Signal red in the prompt and in model search`, async () => {
		await using piu = await startPiu({
			script: none,
			terminalBackground: mode,
		});
		const [initial, changed] =
			mode === "light" ? [lightTheme, darkTheme] : [darkTheme, lightTheme];
		const cursorIs = (color: string) =>
			piu.renderer.getCursorState().color.equals(RGBA.fromHex(color));
		await piu.waitForFrame(
			(frame) =>
				frame.includes("faux-1") && frame.includes("/ commands   @ files"),
		);
		expect(cursorIs(initial.signal)).toBe(true);
		piu.mockInput.pressKey("l", { ctrl: true });
		await piu.waitForFrame(
			(frame) => frame.includes("search models") && frame.includes("faux-2"),
		);
		expect(cursorIs(initial.signal)).toBe(true);
		piu.reportTerminalBackground(mode === "light" ? "dark" : "light");
		await piu.waitForFrame(() => cursorIs(changed.signal));
		piu.mockInput.pressKey("ESCAPE");
		await piu.waitForFrame(
			(frame) =>
				!frame.includes("tab search/list") &&
				frame.includes("/ commands   @ files"),
		);
		expect(cursorIs(changed.signal)).toBe(true);
	});
}

async function userEcho(piu: Awaited<ReturnType<typeof startPiu>>) {
	await piu.mockInput.typeText("Hi");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(frame) => frame.includes("ok") && !frame.includes("[sending]"),
	);
	return piu
		.captureSpans()
		.lines.flatMap((line) => line.spans)
		.find((span) => span.text.trim() === "Hi");
}

test("a terminal reporting a dark background gets the dark tokens", async () => {
	await using piu = await startPiu({
		script: { replies: ["ok"] },
		terminalBackground: "dark",
	});

	const span = await userEcho(piu);

	expect(span?.fg.equals(RGBA.fromHex(darkTheme.text))).toBe(true);
	expect(span?.bg.equals(RGBA.fromHex(darkTheme.raised))).toBe(true);
});

test("a terminal reporting a light background gets the light tokens", async () => {
	await using piu = await startPiu({
		script: { replies: ["ok"] },
		terminalBackground: "light",
	});

	const span = await userEcho(piu);

	expect(span?.fg.equals(RGBA.fromHex(lightTheme.text))).toBe(true);
	expect(span?.bg.equals(RGBA.fromHex(lightTheme.raised))).toBe(true);
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
					span.text.trim() === "Hi" &&
					span.fg.equals(RGBA.fromHex(lightTheme.text)),
			),
	);
});

test("a terminal that reports nothing gets the dark tokens", async () => {
	await using piu = await startPiu({ script: { replies: ["ok"] } });

	const span = await userEcho(piu);

	expect(span?.fg.equals(RGBA.fromHex(darkTheme.text))).toBe(true);
});

for (const mode of ["dark", "light"] as const) {
	test(`an accent override in config.json changes the accent on a ${mode} terminal`, async () => {
		await using piu = await startPiu({
			script: { replies: ["ok"] },
			terminalBackground: mode,
			config: { theme: { accent: "#ff00ff" } },
		});

		await piu.waitForFrame((f) => f.includes("faux-1"));
		piu.mockInput.pressKey("l", { ctrl: true });
		await piu.waitForFrame((f) => f.includes("faux-2") && f.includes("All"));
		expect(
			piu
				.captureSpans()
				.lines.flatMap((line) => line.spans)
				.find((span) => span.text.trim() === "All")
				?.fg.equals(RGBA.fromHex("#ff00ff")),
		).toBe(true);
	});
}

test("an override leaves the other tokens of the active theme alone", async () => {
	await using piu = await startPiu({
		script: { replies: ["ok"] },
		terminalBackground: "light",
		config: { theme: { accent: "#ff00ff" } },
	});

	const span = await userEcho(piu);

	expect(span?.bg.equals(RGBA.fromHex(lightTheme.raised))).toBe(true);
});

test("a code keyword is drawn in the text color of the theme the terminal asked for", async () => {
	const reply = "```ts\nconst answer = 42;\n```";
	await using piu = await startPiu({
		script: { replies: [reply] },
		terminalBackground: "light",
	});
	const keyword = RGBA.fromHex(lightTheme.text);

	await piu.mockInput.typeText("Code");
	piu.mockInput.pressEnter();

	await piu.waitForFrame(() =>
		piu
			.captureSpans()
			.lines.some((line) =>
				line.spans.some(
					(span) =>
						span.text.trim() === "const" &&
						span.fg.equals(keyword) &&
						bold(span),
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

test("code already on screen is redrawn in the new colors when the terminal switches background", async () => {
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
						span.text.trim() === "const" &&
						span.fg.equals(RGBA.fromHex(hex)) &&
						bold(span),
				),
			);

	await piu.mockInput.typeText("Code");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(keywordIs(darkTheme.text));

	piu.reportTerminalBackground("light");
	await piu.waitForFrame(keywordIs(lightTheme.text));
});

const swissReply = [
	"## Plan",
	"",
	"- first with **strong** and `inline` words",
	"",
	"```ts",
	"// note",
	"function greet(name: string): number {",
	'\treturn greet("x") + 42;',
	"}",
	"```",
].join("\n");

type Span = { text: string; fg: RGBA; bg: RGBA; attributes: number };

const spansOf = (piu: Awaited<ReturnType<typeof startPiu>>): Span[] =>
	piu.captureSpans().lines.flatMap((line) => line.spans);
const spanAt = (spans: Span[], text: string) =>
	spans.find((span) => span.text.trim() === text);
const bold = (span: Span | undefined) =>
	((span?.attributes ?? 0) & TextAttributes.BOLD) !== 0;
const italic = (span: Span | undefined) =>
	((span?.attributes ?? 0) & TextAttributes.ITALIC) !== 0;
const fgIs = (span: Span | undefined, hex: string) =>
	span?.fg.equals(RGBA.fromHex(hex)) === true;
const bgIs = (span: Span | undefined, hex: string) =>
	span?.bg.equals(RGBA.fromHex(hex)) === true;

async function swissSpans(
	piu: Awaited<ReturnType<typeof startPiu>>,
	theme: Theme,
) {
	await piu.mockInput.typeText("Swiss");
	piu.mockInput.pressEnter();
	let spans: Span[] = [];
	await piu.waitForFrame(() => {
		spans = spansOf(piu);
		return (
			bold(spanAt(spans, "Plan")) &&
			bgIs(spanAt(spans, "inline"), theme.code) &&
			fgIs(spanAt(spans, "42"), theme.warning)
		);
	});
	return spans;
}

for (const [mode, theme] of [
	["light", lightTheme],
	["dark", darkTheme],
] as const) {
	test(`markdown and code in a reply take the Swiss tokens on a ${mode} terminal`, async () => {
		await using piu = await startPiu({
			script: { replies: [swissReply] },
			terminalBackground: mode,
		});

		const spans = await swissSpans(piu, theme);

		const heading = spanAt(spans, "Plan");
		expect(fgIs(heading, theme.text) && bold(heading)).toBe(true);
		expect(fgIs(spanAt(spans, "-"), theme.signal)).toBe(true);
		const strong = spanAt(spans, "strong");
		expect(fgIs(strong, theme.text) && bold(strong)).toBe(true);
		expect(bgIs(strong, theme.code)).toBe(false);
		const inline = spanAt(spans, "inline");
		expect(fgIs(inline, theme.secondary) && bgIs(inline, theme.code)).toBe(
			true,
		);
		expect(bold(inline)).toBe(false);

		const keyword = spanAt(spans, "function");
		expect(fgIs(keyword, theme.text) && bold(keyword)).toBe(true);
		expect(fgIs(spanAt(spans, "greet"), theme.secondary)).toBe(true);
		expect(fgIs(spanAt(spans, "string"), theme.tertiary)).toBe(true);
		expect(fgIs(spanAt(spans, '"x"'), theme.success)).toBe(true);
		const comment = spanAt(spans, "// note");
		expect(fgIs(comment, theme.faint) && italic(comment)).toBe(true);
		expect(fgIs(spanAt(spans, "+"), theme.muted)).toBe(true);
		expect(bgIs(keyword, theme.codeBlock)).toBe(true);
		expect(bgIs(spanAt(spans, "words"), theme.codeBlock)).toBe(false);
	});
}

test("a light terminal gets a white screen with black text and a red signal", async () => {
	await using piu = await startPiu({
		script: { replies: [swissReply] },
		terminalBackground: "light",
	});

	const spans = await swissSpans(piu, lightTheme);

	const words = spanAt(spans, "words");
	expect(fgIs(words, "#000000") && bgIs(words, "#ffffff")).toBe(true);
	expect(fgIs(spanAt(spans, "-"), "#e10600")).toBe(true);
	expect(bgIs(spanAt(spans, "function"), "#f5f5f5")).toBe(true);
	expect(bgIs(spanAt(spans, "inline"), "#f1f3f8")).toBe(true);
});

test("a signal override in config.json colors the list markers", async () => {
	await using piu = await startPiu({
		script: { replies: [swissReply] },
		terminalBackground: "light",
		config: { theme: { signal: "#123456" } },
	});

	const spans = await swissSpans(piu, lightTheme);

	expect(fgIs(spanAt(spans, "-"), "#123456")).toBe(true);
});

test("a token the theme does not have is a startup error with the field path", async () => {
	await expect(
		startPiu({ script: none, config: { theme: { nope: "#ff00ff" } } }),
	).rejects.toThrow("theme.nope");
});
