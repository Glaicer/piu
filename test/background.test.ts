import { expect, test } from "bun:test";
import { join } from "node:path";
import { blocker } from "./blocker.ts";
import { inputArea, panelText, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;
type Script = Parameters<typeof startPiu>[0]["script"];

const standIn = join(
	import.meta.dir,
	"fixtures/pi-extensions/shell-background.ts",
);
const agentPanel = (frame: string) => panelText(frame, 10);
const HEADER = "Background processes";

function pinned(frame: string) {
	const row = frame.split("\n").findIndex((line) => line.includes(HEADER));
	return row < 0 ? "" : panelText(frame, 10, row);
}

const pinnedRows = (frame: string, text = "") =>
	pinned(frame)
		.split("\n")
		.filter((line) => /bg-\d/.test(line) && line.includes(text));

const background = (command: string) => ({
	toolCalls: [{ name: "bash", args: { command, background: true } }],
});

function start(
	script: Script,
	options?: Partial<Parameters<typeof startPiu>[0]>,
) {
	return startPiu({
		installedPiExtensions: [standIn],
		backendEnv: { PIU_STANDIN_DELIVER: "0" },
		...options,
		script,
	});
}

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

test("a command started in the background is pinned above the input with its job id and status, and stays after the run ends", async () => {
	using job = blocker("alpha");
	await using piu = await start({
		replies: [background(job.command), "Launched it"],
	});

	await send(piu, "Go");
	const frame = await piu.waitForFrame(
		(f) =>
			pinnedRows(f, "alpha").length === 1 &&
			f.includes("Launched it") &&
			!f.includes("Working"),
	);

	expect(pinnedRows(frame)[0]).toMatch(/bg-1 +running +: alpha/);
	const rows = frame.split("\n");
	const header = rows.findIndex((line) => line.includes(HEADER));
	const inputTop = rows.findIndex((line) => line.includes("┌─ input"));
	expect(header).toBeGreaterThan(rows.findIndex((l) => l.includes("Launched")));
	expect(header).toBeLessThan(inputTop);
	expect(agentPanel(frame)).not.toContain(HEADER);
	expect(agentPanel(frame)).toMatch(/▸ bash .*bg-1 running/);
});

test("when the process ends the pin goes away without a new message, and its card in the history keeps the final status", async () => {
	using job = blocker("beta");
	await using piu = await start({
		replies: [background(job.command), "Launched it"],
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => pinnedRows(f, "beta").length === 1);

	job.release();

	const frame = await piu.waitForFrame((f) => !f.includes(HEADER));
	const cards = agentPanel(frame)
		.split("\n")
		.filter((line) => line.includes("▸ bash"));
	expect(cards).toHaveLength(1);
	expect(cards[0]).toMatch(/bg-1 done/);
});

test("a foreground command that outlives the auto-background threshold is pinned only once it moves to the background", async () => {
	using job = blocker("gamma");
	await using piu = await start(
		{
			replies: [
				{ toolCalls: [{ name: "bash", args: { command: job.command } }] },
				"Moved on",
			],
		},
		{ backendEnv: { PIU_STANDIN_DELIVER: "0", PIU_STANDIN_AUTO_MS: "1500" } },
	);

	await send(piu, "Go");
	const foreground = await piu.waitForFrame((f) => f.includes("running"));
	expect(foreground).not.toContain(HEADER);
	expect(agentPanel(foreground)).not.toContain("bg-");

	const moved = await piu.waitForFrame(
		(f) => pinnedRows(f, "gamma").length === 1 && f.includes("Moved on"),
	);
	expect(pinnedRows(moved)[0]).toContain("running");
});

test("a foreground command that ends before the threshold is never pinned", async () => {
	await using piu = await start(
		{
			replies: [
				{ toolCalls: [{ name: "bash", args: { command: "true" } }] },
				"Quick",
			],
		},
		{ backendEnv: { PIU_STANDIN_DELIVER: "0", PIU_STANDIN_AUTO_MS: "1500" } },
	);

	await send(piu, "Go");
	await piu.waitForFrame((f) => f.includes("Quick"));
	await Bun.sleep(300);
	await piu.renderOnce();
	expect(piu.captureCharFrame()).not.toContain(HEADER);
});

test("two jobs with the same command stay separate, and stopping one unpins only that one", async () => {
	await using piu = await start({
		replies: [
			background("sleep 30"),
			background("sleep 30"),
			{ toolCalls: [{ name: "shell_kill", args: { id: "bg-1" } }] },
			"Stopped one",
		],
	});

	await send(piu, "Go");
	const both = await piu.waitForFrame(
		(f) => pinnedRows(f, "sleep 30").length === 2,
	);
	expect(pinnedRows(both)[0]).toContain("bg-1");
	expect(pinnedRows(both)[1]).toContain("bg-2");

	const after = await piu.waitForFrame(
		(f) => f.includes("Stopped one") && pinnedRows(f).length === 1,
	);
	expect(pinnedRows(after)[0]).toContain("bg-2");
	const killed = agentPanel(after)
		.split("\n")
		.find((line) => line.includes("bg-1 "));
	expect(killed).toMatch(/bg-1 killed/);
});

test("a job that ends while another command keeps the run busy is unpinned at once", async () => {
	using first = blocker("first");
	using second = blocker("second");
	await using piu = await start({
		replies: [background(first.command), second.step, "All over"],
	});
	await send(piu, "Go");
	await piu.waitForFrame(
		(f) => pinnedRows(f, "first").length === 1 && f.includes("Working"),
	);

	first.release();

	const frame = await piu.waitForFrame((f) => !f.includes(HEADER));
	expect(frame).toContain("Working");
	expect(frame).not.toContain("All over");
	second.release();
	await piu.waitForFrame((f) => f.includes("All over"));
});

test("a job that fails is unpinned and its card shows it failed", async () => {
	await using piu = await start({
		replies: [background("sleep 0.5; exit 3"), "Launched it"],
	});

	await send(piu, "Go");
	await piu.waitForFrame((f) => pinnedRows(f, "exit 3").length === 1);

	const frame = await piu.waitForFrame((f) => !f.includes(HEADER));
	expect(agentPanel(frame)).toMatch(/▸ bash .*bg-1 failed/);
});

test("a new user message and its reply do not push the pinned job out", async () => {
	using job = blocker("iota");
	await using piu = await start({
		replies: [background(job.command), "Launched it", "Second answer"],
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => pinnedRows(f, "iota").length === 1);

	await send(piu, "Next question");

	const frame = await piu.waitForFrame((f) => f.includes("Second answer"));
	expect(pinnedRows(frame, "iota")).toHaveLength(1);
	expect(agentPanel(frame)).toContain("> Next question");
});

function numbered(count: number) {
	return Array.from(
		{ length: count },
		(_, index) => `Row ${String(index).padStart(3, "0")}`,
	).join("\n\n");
}

test("scrolling the history up keeps the pin in view, and its updates neither move the history nor take the focus", async () => {
	using job = blocker("delta");
	await using piu = await start({
		replies: [background(job.command), numbered(40)],
	});
	await send(piu, "Go");
	await piu.waitForFrame(
		(f) => pinnedRows(f, "delta").length === 1 && f.includes("Row 039"),
	);

	for (let i = 0; i < 12; i++) await piu.mockMouse.scroll(10, 5, "up");
	const scrolled = await piu.waitForFrame(
		(f) => !agentPanel(f).includes("Row 039") && f.includes("Row 0"),
	);
	expect(pinnedRows(scrolled, "delta")).toHaveLength(1);
	const firstShown = /Row (\d{3})/.exec(agentPanel(scrolled))?.[0];

	job.release();
	const after = await piu.waitForFrame((f) => !f.includes(HEADER));
	expect(agentPanel(after)).toContain(firstShown ?? "unreachable");
	expect(agentPanel(after)).not.toContain("Row 039");
	await piu.mockInput.typeText("still typing");
	await piu.waitForFrame((f) => inputArea(f).includes("still typing"));
});

test("the job's end is not waited for from a model turn: the delivery message and shell_status add no second process card", async () => {
	using job = blocker("epsilon");
	await using piu = await start(
		{
			replies: [
				background(job.command),
				"Launched it",
				{ toolCalls: [{ name: "shell_status", args: { id: "bg-1" } }] },
				"Saw the result",
			],
		},
		{ backendEnv: { PIU_STANDIN_DELIVER: "1" } },
	);
	await send(piu, "Go");
	await piu.waitForFrame((f) => pinnedRows(f, "epsilon").length === 1);

	job.release();

	await piu.waitForFrame((f) => f.includes("Saw the result"));
	const frame = await piu.waitForFrame((f) => !f.includes(HEADER));
	const cards = agentPanel(frame)
		.split("\n")
		.filter((line) => line.includes("▸ bash"));
	expect(cards).toHaveLength(1);
	expect(cards[0]).toMatch(/bg-1 done/);
});

test("a new session does not inherit the previous session's pinned jobs", async () => {
	using job = blocker("zeta");
	await using piu = await start({
		replies: [background(job.command), "Launched it"],
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => pinnedRows(f, "zeta").length === 1);

	await send(piu, "/new");

	await piu.waitForFrame((f) => !f.includes(HEADER) && !f.includes("Launched"));
	await Bun.sleep(800);
	await piu.renderOnce();
	expect(piu.captureCharFrame()).not.toContain(HEADER);
});

test("the pin moves to another Panel with the Placement, leaving the default one empty", async () => {
	using job = blocker("eta");
	await using moved = await start(
		{ replies: [background(job.command), "Launched it"] },
		{ config: { placement: { pinned: [], side: ["background.processes"] } } },
	);
	await send(moved, "Go");
	const frame = await moved.waitForFrame(
		(f) => panelText(f, 150).includes("bg-1") && f.includes("Launched it"),
	);
	expect(panelText(frame, 150)).toContain("running");
	const headers = frame.split("\n").filter((l) => l.includes(HEADER));
	expect(headers).toHaveLength(1);
	expect(headers[0]?.indexOf(HEADER)).toBeGreaterThan(106);
});

test("with a Layout that has no pinned Panel the app works as before and the job is not pinned", async () => {
	using job = blocker("theta");
	const layout = {
		kind: "container",
		id: "root",
		direction: "column",
		size: "rest",
		children: [
			{ kind: "panel", id: "agent", direction: "column", size: "rest" },
			{ kind: "panel", id: "input", direction: "column", size: "content" },
		],
	};
	await using piu = await start(
		{ replies: [background(job.command), "Launched it"] },
		{ config: { layout } },
	);
	await send(piu, "Go");
	const frame = await piu.waitForFrame((f) => f.includes("Launched it"));
	expect(frame).not.toContain(HEADER);
	expect(agentPanel(frame)).toContain("bg-1 background");
});
