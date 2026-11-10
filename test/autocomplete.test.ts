import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inputArea, startPiu } from "./harness.ts";

const script = { replies: [], extensionCommands: ["greet"] };
const promptTemplates = {
	"review-code": "---\ndescription: Review the code\n---\nReview the code now",
};

test("/ lists the Backend's prompt templates and extension commands next to the app's own", async () => {
	await using piu = await startPiu({ script, promptTemplates });

	await piu.mockInput.typeText("/");

	const frame = await piu.waitForFrame(
		(f) =>
			f.includes("review-code") && f.includes("greet") && f.includes("/model"),
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

	await piu.mockInput.typeText("/");
	await piu.waitForFrame((f) => f.includes("Extension command other"));
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
			.some((line) => line.startsWith("/reasoning ")),
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
