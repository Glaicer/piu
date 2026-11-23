import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RGBA, TextAttributes } from "@opentui/core";
import { darkTheme, lightTheme } from "../src/theme.ts";
import {
	bottomLine,
	bottomPanel,
	inputArea,
	modalTitle,
	panelBoxes,
	panelText,
	startPiu,
} from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

function workspace(branch?: string) {
	const root = mkdtempSync(join(tmpdir(), "piu-bottom-"));
	const cwd = join(root, "project");
	mkdirSync(cwd);
	if (branch)
		execFileSync("git", [
			"-C",
			cwd,
			"init",
			"--quiet",
			`--initial-branch=${branch}`,
		]);
	return {
		cwd,
		[Symbol.dispose]: () => rmSync(root, { recursive: true, force: true }),
	};
}

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const line = (frame: string) => bottomLine(frame).trim();

function bottomSpans(piu: Piu) {
	const box = panelBoxes(piu).find((found) => found.id === bottomPanel);
	return piu.captureSpans().lines[box?.y ?? -1]?.spans ?? [];
}

function spanWith(piu: Piu, text: string) {
	return bottomSpans(piu).find((span) => span.text.includes(text));
}

test("the bottom line is the screen's last row, black across the whole width, with model, reasoning and folder", async () => {
	using project = workspace();
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		terminalBackground: "light",
		width: 100,
	});
	const frame = await piu.waitForFrame(
		(f) =>
			line(f).includes("project") &&
			line(f).includes("no reasoning") &&
			f.includes("What would you like to build?"),
	);
	expect(line(frame)).toMatch(
		/^faux-1 · no reasoning {4}project +▱{10} {2}0\/128k$/,
	);
	const bottom = panelBoxes(piu).find((box) => box.id === bottomPanel);
	expect(bottom).toMatchObject({ x: 0, y: 29, width: 100, height: 1 });
	const black = RGBA.fromHex(lightTheme.bar);
	expect(bottomSpans(piu).every((span) => span.bg.equals(black))).toBe(true);
	const model = spanWith(piu, "faux-1");
	expect(model?.fg.equals(RGBA.fromHex(lightTheme.barText))).toBe(true);
	expect((model?.attributes ?? 0) & TextAttributes.BOLD).toBeTruthy();
	expect(
		spanWith(piu, "project")?.fg.equals(RGBA.fromHex(lightTheme.barMuted)),
	).toBe(true);
	expect(frame).not.toContain("piu");
	expect(panelText(frame, 10, 0)).not.toContain("faux-1");
	expect(inputArea(frame)).not.toContain("project");
});

test("in a Git repository the bottom line shows the folder and the branch", async () => {
	using project = workspace("feature/bottom");
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		width: 100,
	});
	const frame = await piu.waitForFrame(
		(f) => line(f).includes("feature/bottom") && line(f).includes("faux-1"),
	);
	expect(line(frame)).toMatch(
		/^faux-1 · no reasoning {4}project · feature\/bottom +[▰▱]{10} +\S+$/,
	);
});

test("switching the model and thinking level updates the bottom line", async () => {
	await using piu = await startPiu({
		script: { replies: [], switchCommands: true },
	});
	await piu.waitForFrame((f) => line(f).startsWith("faux-1 · no reasoning"));

	await send(piu, "/to-faux-2");
	await piu.waitForFrame((f) => line(f).startsWith("faux-2 "));

	await send(piu, "/level-high");
	await piu.waitForFrame((f) => line(f).startsWith("faux-2 · high "));
});

async function clickBottom(piu: Piu, text: string) {
	const frame = await piu.waitForFrame((f) => bottomLine(f).includes(text));
	const box = panelBoxes(piu).find((found) => found.id === bottomPanel);
	await piu.mockMouse.click(
		(box?.x ?? 0) + bottomLine(frame).indexOf(text) + 1,
		box?.y ?? 0,
	);
}

test("clicking the model on the bottom line opens the model picker", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await clickBottom(piu, "faux-1");
	await piu.waitForFrame((f) => f.includes(modalTitle("Models")));
});

test("clicking the reasoning level on the bottom line opens the reasoning picker", async () => {
	await using piu = await startPiu({ script: { replies: [] } });
	await clickBottom(piu, "no reasoning");
	const frame = await piu.waitForFrame((f) =>
		f.split("\n").some((text) => /^\s+off\s+$/.test(text)),
	);
	expect(frame).not.toContain(modalTitle("Models"));
});

test("a red working sits right before the context meter while the agent works and goes after the turn", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				{ toolCalls: [{ name: "bash", args: { command: "sleep 0.6" } }] },
				"All done",
			],
		},
		width: 100,
	});
	await piu.waitForFrame((f) => line(f).includes("no reasoning"));
	expect(line(await piu.waitForFrame(() => true))).not.toContain("working");

	await send(piu, "Go");
	const working = await piu.waitForFrame((f) => line(f).includes("working"));
	expect(line(working)).toMatch(/working +[▰▱]{10} +\S+$/);
	expect(
		spanWith(piu, "working")?.fg.equals(RGBA.fromHex(darkTheme.signal)),
	).toBe(true);

	const done = await piu.waitForFrame(
		(f) => f.includes("All done") && !line(f).includes("working"),
	);
	expect(line(done)).toStartWith("faux-1 · no reasoning");
});

test("a Config that places the model and the folder in another Panel shows them there", async () => {
	using project = workspace();
	await using piu = await startPiu({
		script: { replies: [] },
		cwd: project.cwd,
		width: 160,
		config: {
			placement: {
				side: ["model.current", "input.dir"],
				bottom: ["status.working"],
			},
		},
	});
	const frame = await piu.waitForFrame(
		(f) =>
			panelText(f, 150, 1).includes("project") &&
			panelText(f, 150, 1).includes("no reasoning"),
	);
	expect(panelText(frame, 150, 1)).toContain("faux-1 · no reasoning");
	expect(panelBoxes(piu).some((box) => box.id === bottomPanel)).toBe(false);
});
