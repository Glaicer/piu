import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RGBA } from "@opentui/core";
import { darkTheme } from "../src/theme.ts";
import { inputArea, startPiu } from "./harness.ts";

const script = { replies: [], extensionCommands: ["greet"] };
const promptTemplates = {
	"review-code": "---\ndescription: Review the code\n---\nReview the code now",
};
const manyTemplates = Object.fromEntries(
	Array.from({ length: 12 }, (_, index) => {
		const name = `tpl-${String(index + 1).padStart(2, "0")}`;
		return [name, `---\ndescription: ${name}\n---\n${name} body`];
	}),
);

type Piu = Awaited<ReturnType<typeof startPiu>>;

// why: the list is as wide as the prompt field, so a column far past the row's text still belongs to that row.
const EMPTY_COLUMN = 60;

function rowOf(frame: string, label: string) {
	const row = frame.split("\n").findIndex((line) => line.includes(label));
	if (row < 0) throw new Error(`No row shows ${label}:\n${frame}`);
	return row;
}

function templateRows(frame: string) {
	return frame
		.split("\n")
		.filter((line) => /tpl-\d\d/.test(line))
		.map((line) => line.trimEnd());
}

function focusedPanels(frame: string) {
	return [...frame.matchAll(/┌─ ([\w-]+) /g)].map((match) => match[1]);
}

function inputStartsWith(frame: string, prefix: string) {
	return inputArea(frame)
		.split("\n")
		.some((line) => line.startsWith(prefix));
}

function backgroundAt(piu: Piu, column: number, row: number) {
	let end = 0;
	for (const span of piu.captureSpans().lines[row]?.spans ?? []) {
		end += span.width;
		if (column < end) return span.bg;
	}
	return undefined;
}

const highlighted = (piu: Piu, column: number, row: number) =>
	backgroundAt(piu, column, row)?.equals(RGBA.fromHex(darkTheme.border));

test("/ lists the Backend's prompt templates and extension commands next to the app's own", async () => {
	await using piu = await startPiu({ script, promptTemplates });

	await piu.mockInput.typeText("/re");

	const frame = await piu.waitForFrame(
		(f) =>
			f.includes("review-code") &&
			f.includes("greet") &&
			f.includes("/reasoning"),
	);
	expect(frame).toContain("Review the code");
});

test("typing narrows the list and Enter inserts the chosen entry instead of sending", async () => {
	await using piu = await startPiu({
		script: { replies: ["Never asked"], extensionCommands: ["greet"] },
		promptTemplates,
	});

	await piu.mockInput.typeText("/rev");
	const narrowed = await piu.waitForFrame(
		(f) => f.includes("review-code") && !f.includes("greet"),
	);
	expect(narrowed).toContain("review-code");

	piu.mockInput.pressEnter();

	const inserted = await piu.waitForFrame((f) =>
		inputArea(f)
			.split("\n")
			.some((line) => line.startsWith("/review-code ")),
	);
	expect(inserted).not.toContain("Never asked");
	expect(inserted).not.toContain("Review the code");
});

test("an app command runs locally and never reaches the model", async () => {
	await using piu = await startPiu({
		script: { replies: ["Seen {messages} {lastUser}"] },
	});

	await piu.waitForFrame((f) => f.includes("faux-1"));
	await piu.mockInput.typeText("/model");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("faux-2"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("faux-2"));

	await piu.mockInput.typeText("hi");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes('Seen 1 "hi"'));
});

test("a prompt template expands and reaches the model", async () => {
	await using piu = await startPiu({
		script: { replies: ["Got {lastUser}"] },
		promptTemplates,
	});

	await piu.mockInput.typeText("/review-code");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) => f.includes('Got "Review the code now"'));
});

test("an app command hides a Backend command of the same name", async () => {
	await using piu = await startPiu({
		script: { replies: [], extensionCommands: ["model", "other"] },
	});

	await piu.mockInput.typeText("/o");
	await piu.waitForFrame((f) => f.includes("Extension command other"));
	piu.mockInput.pressBackspace();
	await piu.mockInput.typeText("model");

	const frame = await piu.waitForFrame((f) => f.includes("Switch the model"));
	expect(frame).not.toContain("Extension command model");
});

test("Down moves the selection before Enter inserts", async () => {
	await using piu = await startPiu({ script: { replies: [] } });

	await piu.mockInput.typeText("/");
	await piu.waitForFrame((f) => f.includes("Set the reasoning level"));
	piu.mockInput.pressArrow("down");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) =>
		inputArea(f)
			.split("\n")
			.some((line) => line.startsWith("/resume ")),
	);
});

test("Esc closes the list first and only then aborts the run", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{ toolCalls: [{ name: "bash", args: { command: "sleep 30" } }] },
				"Never reached",
			],
		},
	});
	await piu.mockInput.typeText("Go");
	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => f.includes("running"));

	await piu.mockInput.typeText("/");
	await piu.waitForFrame((f) => f.includes("Set the reasoning level"));
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("Set the reasoning level"));
	// why: an abort that wrongly followed the Esc needs a moment to reach the Backend and clear the tool card.
	await Bun.sleep(300);
	await piu.renderOnce();
	expect(piu.captureCharFrame()).toContain("running");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("running"));
});

function makeWorkspace() {
	const root = mkdtempSync(join(tmpdir(), "piu-workspace-"));
	for (const file of [
		"README.md",
		"src/main.ts",
		"src/lib/parse.ts",
		".git/config",
		"node_modules/dep/index.js",
	]) {
		mkdirSync(dirname(join(root, file)), { recursive: true });
		writeFileSync(join(root, file), "");
	}
	return root;
}

test("@ lists the files of the working folder and skips hidden and dependency folders", async () => {
	const cwd = makeWorkspace();
	try {
		await using piu = await startPiu({ script: { replies: [] }, cwd });

		await piu.mockInput.typeText("@");

		const frame = await piu.waitForFrame(
			(f) =>
				f.includes("README.md") &&
				f.includes("src/main.ts") &&
				f.includes("src/lib/parse.ts"),
		);
		expect(frame).not.toContain("node_modules");
		expect(frame).not.toContain(".git/config");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("@ narrows as I type and Enter inserts the chosen path in place", async () => {
	const cwd = makeWorkspace();
	try {
		await using piu = await startPiu({ script: { replies: [] }, cwd });

		await piu.mockInput.typeText("see @par");
		const narrowed = await piu.waitForFrame((f) =>
			f.includes("src/lib/parse.ts"),
		);
		expect(narrowed).not.toContain("README.md");
		piu.mockInput.pressEnter();

		await piu.waitForFrame((f) =>
			inputArea(f)
				.split("\n")
				.some((line) => line.startsWith("see @src/lib/parse.ts ")),
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("@ completes in the middle of text after wide characters", async () => {
	const cwd = makeWorkspace();
	try {
		await using piu = await startPiu({ script: { replies: [] }, cwd });

		await piu.mockInput.typeText("日本語 @par later");
		for (let i = 0; i < " later".length; i++) piu.mockInput.pressArrow("left");
		await piu.waitForFrame((f) => f.includes("src/lib/parse.ts"));
		piu.mockInput.pressEnter();

		await piu.waitForFrame((f) =>
			inputArea(f)
				.split("\n")
				.some(
					(line) =>
						line.startsWith("日本語 @src/lib/parse.ts") &&
						line.includes("later"),
				),
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("Tab inserts the chosen entry", async () => {
	await using piu = await startPiu({ script: { replies: [] } });

	await piu.mockInput.typeText("/reas");
	await piu.waitForFrame((f) => f.includes("Set the reasoning level"));
	piu.mockInput.pressTab();

	await piu.waitForFrame((f) =>
		inputArea(f)
			.split("\n")
			.some((line) => line.startsWith("/reasoning ")),
	);
});

test("a command typed in capitals runs the same app command", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.waitForFrame((f) => f.includes("faux-1"));

	await piu.mockInput.typeText("/MODEL");
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) => f.includes("faux-2"));
});

test("hovering a row selects it, so Enter inserts the hovered prompt template", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		promptTemplates,
		terminalBackground: "dark",
	});

	await piu.mockInput.typeText("/re");
	const frame = await piu.waitForFrame(
		(f) => f.includes("review-code") && f.includes("Set the reasoning level"),
	);
	const row = rowOf(frame, "review-code");
	expect(row).toBeGreaterThan(rowOf(frame, "Set the reasoning level"));

	await piu.mockMouse.moveTo(3, row);
	await piu.renderOnce();
	expect(highlighted(piu, 3, row)).toBe(true);

	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) => inputStartsWith(f, "/review-code "));
});

test("clicking a slash row inserts it, closes the list and keeps the focus in the input", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		promptTemplates,
	});

	await piu.mockInput.typeText("/rev");
	const frame = await piu.waitForFrame((f) => f.includes("review-code"));
	const row = rowOf(frame, "review-code");
	await piu.mockMouse.click(
		(frame.split("\n")[row] ?? "").indexOf("review-code"),
		row,
	);

	const inserted = await piu.waitForFrame(
		(f) =>
			inputStartsWith(f, "/review-code ") && !f.includes("Review the code"),
	);
	expect(focusedPanels(inserted)).toEqual(["input"]);

	await piu.mockInput.typeText("now");
	const typed = await piu.waitForFrame((f) =>
		inputArea(f).includes("/review-code now"),
	);
	expect(focusedPanels(typed)).toEqual(["input"]);
});

test("an @ row is highlighted by hover and inserted by a click on its empty part", async () => {
	const cwd = makeWorkspace();
	try {
		await using piu = await startPiu({
			script: { replies: [] },
			cwd,
			terminalBackground: "dark",
		});

		await piu.mockInput.typeText("see @");
		const frame = await piu.waitForFrame(
			(f) => f.includes("README.md") && f.includes("src/lib/parse.ts"),
		);
		const readme = rowOf(frame, "README.md");
		await piu.mockMouse.moveTo(
			(frame.split("\n")[readme] ?? "").indexOf("README"),
			readme,
		);
		await piu.renderOnce();
		expect(highlighted(piu, 3, readme)).toBe(true);

		await piu.mockMouse.click(EMPTY_COLUMN, rowOf(frame, "src/lib/parse.ts"));

		const inserted = await piu.waitForFrame(
			(f) =>
				inputStartsWith(f, "see @src/lib/parse.ts ") &&
				!f.includes("README.md"),
		);
		expect(focusedPanels(inserted)).toEqual(["input"]);

		await piu.mockInput.typeText("later");
		await piu.waitForFrame((f) =>
			inputArea(f).includes("see @src/lib/parse.ts later"),
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("hovering the top row of a scrolled list keeps the window still, and Enter takes the row under the pointer", async () => {
	await using piu = await startPiu({
		script: { replies: [] },
		promptTemplates: manyTemplates,
		terminalBackground: "dark",
	});

	await piu.mockInput.typeText("/tpl-");
	await piu.waitForFrame((f) => f.includes("tpl-01") && f.includes("tpl-08"));
	for (let i = 0; i < 11; i++) piu.mockInput.pressArrow("down");
	const scrolled = await piu.waitForFrame(
		(f) => f.includes("tpl-12") && !f.includes("tpl-01"),
	);
	expect(templateRows(scrolled)).toHaveLength(8);

	piu.mockInput.pressArrow("up");
	await piu.renderOnce();
	expect(templateRows(piu.captureCharFrame())).toEqual(templateRows(scrolled));

	const row = rowOf(scrolled, "tpl-05");
	await piu.mockMouse.moveTo(EMPTY_COLUMN, row);
	await piu.renderOnce();
	expect(templateRows(piu.captureCharFrame())).toEqual(templateRows(scrolled));
	expect(highlighted(piu, EMPTY_COLUMN, row)).toBe(true);

	const below = rowOf(scrolled, "tpl-08");
	await piu.mockMouse.moveTo(EMPTY_COLUMN, below);
	await piu.renderOnce();
	expect(templateRows(piu.captureCharFrame())).toEqual(templateRows(scrolled));
	expect(highlighted(piu, EMPTY_COLUMN, below)).toBe(true);
	expect(highlighted(piu, EMPTY_COLUMN, row)).toBe(false);

	piu.mockInput.pressEnter();
	await piu.waitForFrame((f) => inputStartsWith(f, "/tpl-08 "));
});

test("a pointer resting where the list opens leaves the first entry selected", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await piu.waitForFrame((f) => f.includes("faux-1"));

	await piu.mockInput.typeText("/");
	const frame = await piu.waitForFrame((f) => f.includes("/tree"));
	piu.mockInput.pressBackspace();
	await piu.waitForFrame((f) => !f.includes("/tree"));
	await piu.mockMouse.moveTo(EMPTY_COLUMN, rowOf(frame, "/tree"));

	await piu.mockInput.typeText("/");
	await piu.waitForFrame((f) => f.includes("/tree"));
	await piu.renderOnce();
	piu.mockInput.pressTab();

	await piu.waitForFrame((f) => inputStartsWith(f, "/new "));
});

test("completing with the cursor inside a word replaces the whole word", async () => {
	await using piu = await startPiu({ script, promptTemplates });

	await piu.mockInput.typeText("/review-code");
	for (let i = 0; i < 5; i++) piu.mockInput.pressArrow("left");
	await piu.waitForFrame((f) => f.includes("Review the code"));
	piu.mockInput.pressTab();

	const frame = await piu.waitForFrame((f) =>
		inputArea(f)
			.split("\n")
			.some((line) => line.startsWith("/review-code")),
	);
	const line = inputArea(frame)
		.split("\n")
		.find((text) => text.startsWith("/review-code"));
	expect(line?.trimEnd()).toBe("/review-code");
});
