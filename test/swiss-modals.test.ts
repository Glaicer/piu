import { expect, test } from "bun:test";
import { RGBA, TextAttributes } from "@opentui/core";
import { lightTheme } from "../src/theme.ts";
import { glyphs, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;
type Token = keyof typeof lightTheme;

function spanOn(piu: Piu, row: number, text: string) {
	return piu
		.captureSpans()
		.lines[row]?.spans.find((span) => span.text.includes(text));
}

function rowOf(frame: string, text: string, from = 0) {
	const rows = frame.split("\n");
	const row = rows.findIndex((line, at) => at >= from && line.includes(text));
	if (row < 0) throw new Error(`No row shows ${text}:\n${frame}`);
	return row;
}

function expectColors(
	piu: Piu,
	row: number,
	text: string,
	colors: { fg?: Token; bg?: Token; bold?: boolean },
) {
	const span = spanOn(piu, row, text);
	if (!span) throw new Error(`No span ${text} on row ${row}`);
	if (colors.fg)
		expect(span.fg.equals(RGBA.fromHex(lightTheme[colors.fg]))).toBe(true);
	if (colors.bg)
		expect(span.bg.equals(RGBA.fromHex(lightTheme[colors.bg]))).toBe(true);
	if (colors.bold !== undefined)
		expect((span.attributes & TextAttributes.BOLD) !== 0).toBe(colors.bold);
}

const light = { terminalBackground: "light" as const };

async function raise(args: Record<string, string | string[]>) {
	const piu = await startPiu({
		...light,
		script: {
			uiTool: true,
			replies: [
				{ toolCalls: [{ name: "ui", args }] },
				"Extension got {toolResult}",
			],
		},
	});
	await piu.mockInput.typeText("go");
	piu.mockInput.pressEnter();
	return piu;
}

test("a Modal is white under a heavy black line, with a bold title and a faint esc", async () => {
	await using piu = await startPiu({ script: { replies: [] }, ...light });
	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("l", { ctrl: true });
	const frame = await piu.waitForFrame(
		(f) => f.includes("faux-2") && f.includes("search models"),
	);
	const title = rowOf(frame, " Models ");
	const rule = frame.split("\n")[title - 1] ?? "";
	expect(rule).toContain(glyphs.heavyRule.repeat(55));
	expectColors(piu, title - 1, glyphs.heavyRule, { fg: "text", bg: "surface" });
	expectColors(piu, title, "Models", { fg: "text", bg: "surface", bold: true });
	expect(frame.split("\n")[title]).toMatch(/Models +esc/);
	expectColors(piu, title, "esc", { fg: "faint" });
});

test("the model picker marks the active tab, the search and the current model the Swiss way", async () => {
	await using piu = await startPiu({ script: { replies: [] }, ...light });
	await piu.waitForFrame((f) => f.includes("faux-1"));
	piu.mockInput.pressKey("l", { ctrl: true });
	const frame = await piu.waitForFrame(
		(f) => f.includes("faux-2") && f.includes("search models"),
	);
	const tabs = rowOf(frame, "All");
	expectColors(piu, tabs, "All", { fg: "text", bold: true });
	expectColors(piu, tabs, "Favorites", { fg: "muted", bold: false });
	const under = frame.split("\n")[tabs + 1] ?? "";
	const all = (frame.split("\n")[tabs] ?? "").indexOf("All");
	expect(under.slice(all, all + 3)).toBe(glyphs.heavyRule.repeat(3));
	expect(under).toContain(glyphs.rule.repeat(5));
	const search = rowOf(frame, "search models");
	expectColors(piu, search, "›", { fg: "signal" });
	expectColors(piu, search, "search models", { fg: "faint" });
	const current = rowOf(frame, "faux-1  current", search);
	expectColors(piu, current, "faux-1", {
		fg: "barText",
		bg: "bar",
		bold: true,
	});
	expectColors(piu, current, "current", { fg: "barMuted", bg: "bar" });
	const other = rowOf(frame, "☆ faux-2");
	expectColors(piu, other, "☆", { fg: "faint" });
	expectColors(piu, other, "faux-2", {
		fg: "text",
		bg: "surface",
		bold: false,
	});
	expect(frame).toContain("tab search/list   ←/→ tabs   f favorite   ⏎ pick");
});

test("a select dialog puts its title in the Modal's title row and inverts the chosen option", async () => {
	await using piu = await raise({
		method: "select",
		title: "Pick a fruit",
		options: ["Apple", "Banana"],
	});
	const frame = await piu.waitForFrame(
		(f) => f.includes("Pick a fruit") && f.includes("Banana"),
	);
	const title = rowOf(frame, "Pick a fruit");
	expect(frame.split("\n")[title - 1]).toContain(glyphs.heavyRule.repeat(20));
	expectColors(piu, title, "Pick a fruit", { fg: "text", bold: true });
	const apple = rowOf(frame, "Apple");
	expect(apple).toBe(title + 2);
	expectColors(piu, apple, "Apple", { fg: "barText", bg: "bar", bold: true });
	expectColors(piu, apple + 1, "Banana", {
		fg: "text",
		bg: "surface",
		bold: false,
	});
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(() => {
		const banana = spanOn(piu, apple + 1, "Banana");
		return banana?.bg.equals(RGBA.fromHex(lightTheme.bar)) ?? false;
	});
	expectColors(piu, apple, "Apple", { fg: "text", bg: "surface" });
});

test("a confirm dialog shows its message muted under the title, above Yes and No", async () => {
	await using piu = await raise({
		method: "confirm",
		title: "Discard the draft?",
		message: "The text will be lost.",
	});
	const frame = await piu.waitForFrame(
		(f) => f.includes("Discard the draft?") && f.includes("No"),
	);
	const title = rowOf(frame, "Discard the draft?");
	expectColors(piu, title, "Discard the draft?", { fg: "text", bold: true });
	expect(rowOf(frame, "The text will be lost.")).toBe(title + 2);
	expectColors(piu, title + 2, "The text will be lost.", { fg: "muted" });
	expectColors(piu, title + 3, "Yes", { fg: "barText", bg: "bar" });
	expectColors(piu, title + 4, "No", { fg: "text", bg: "surface" });
});

function bgAt(piu: Piu, column: number, row: number) {
	let end = 0;
	for (const span of piu.captureSpans().lines[row]?.spans ?? []) {
		end += span.width;
		if (column < end) return span.bg;
	}
}

test("an info Toast is a solid block in the text colour with the message in the background colour", async () => {
	await using piu = await raise({
		method: "notify",
		message: "Build finished",
	});
	const frame = await piu.waitForFrame((f) => f.includes("Build finished"));
	const row = rowOf(frame, "Build finished");
	expectColors(piu, row, "Build finished", { fg: "background", bg: "text" });
	const column = (frame.split("\n")[row] ?? "").indexOf("Build finished");
	const ink = RGBA.fromHex(lightTheme.text);
	expect(bgAt(piu, column - 2, row - 1)?.equals(ink)).toBe(true);
	expect(bgAt(piu, column - 2, row + 1)?.equals(ink)).toBe(true);
	expect(frame.split("\n")[row - 1]?.[column - 3]).not.toBe(glyphs.divider);
});

test("an error Toast is a red block", async () => {
	await using piu = await startPiu({
		...light,
		script: { replies: ["Fine"], failingHook: true },
	});
	await piu.mockInput.typeText("go");
	piu.mockInput.pressEnter();
	const frame = await piu.waitForFrame((f) => f.includes("hook exploded"));
	expectColors(piu, rowOf(frame, "hook exploded"), "hook exploded", {
		fg: "background",
		bg: "error",
	});
});

test("the / list is a raised sheet under a heavy black line, with the chosen entry inverted", async () => {
	await using piu = await startPiu({ script: { replies: [] }, ...light });
	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("/re");
	const frame = await piu.waitForFrame(
		(f) => f.includes("/reasoning") && f.includes("/resume"),
	);
	const rows = frame.split("\n");
	const first = rows.findIndex((line) => /^ +\/re/.test(line));
	expect(first).toBeGreaterThan(0);
	expect(rows[first - 1]?.trimStart()).toStartWith(glyphs.heavyRule.repeat(20));
	const left = (rows[first - 1] ?? "").indexOf(glyphs.heavyRule);
	expect(
		bgAt(piu, left, first - 1)?.equals(RGBA.fromHex(lightTheme.raised)),
	).toBe(true);
	expectColors(piu, first - 1, glyphs.heavyRule, { fg: "text", bg: "raised" });
	expect(rows[first]?.[left]).toBe(" ");
	const label = (rows[first] ?? "").trim().split(" ")[0] ?? "";
	expectColors(piu, first, label, { fg: "barText", bg: "bar", bold: true });
	const [next = "", detail = ""] = (rows[first + 1] ?? "")
		.trim()
		.split(/ {2,}/);
	expectColors(piu, first + 1, next, { fg: "text", bg: "raised", bold: true });
	expectColors(piu, first + 1, detail, { fg: "muted", bg: "raised" });
	const column = (line: string, text: string) => line.indexOf(text);
	const firstDetail = (rows[first] ?? "").trim().split(/ {2,}/)[1] ?? "";
	expect(column(rows[first] ?? "", firstDetail)).toBe(
		column(rows[first + 1] ?? "", detail),
	);
});
