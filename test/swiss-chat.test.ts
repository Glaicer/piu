import { expect, test } from "bun:test";
import { join } from "node:path";
import { RGBA, TextAttributes } from "@opentui/core";
import { lightTheme } from "../src/theme.ts";
import { blocker } from "./blocker.ts";
import { panelBoxes, panelText, startPiu } from "./harness.ts";
import { subagentsControl } from "./subagents-control.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const chat = (frame: string) => panelText(frame, 10);

function agentPanel(piu: Piu) {
	const panel = panelBoxes(piu).find((box) => box.id === "agent");
	if (!panel) throw new Error("The chat Panel is not visible");
	return panel;
}

function span(piu: Piu, text: string, row?: number) {
	const panel = agentPanel(piu);
	const lines = piu
		.captureSpans()
		.lines.slice(panel.y + 1, panel.y + panel.height - 1);
	return (row === undefined ? lines : lines.slice(row, row + 1))
		.flatMap((line) => line.spans)
		.find((span) => span.text.includes(text));
}

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

function foregroundTools(piu: Piu, frame: string) {
	const rows = chat(frame).split("\n");
	const indices = rows.flatMap((row, index) =>
		/ (bash|read) /.test(row) ? [index] : [],
	);
	expect(indices).toHaveLength(3);
	expect(indices[1]).toBe((indices[0] ?? -1) + 1);
	expect(indices[2]).toBe((indices[1] ?? -1) + 1);
	for (const [index, status, color] of [
		[indices[0], /● +\d+(\.\d+)?m?s/, lightTheme.faint],
		[indices[1], /● error +\d+(\.\d+)?m?s/, lightTheme.error],
		[indices[2], /◐ running/, lightTheme.signal],
	] as const) {
		expect(rows[index ?? -1]).toMatch(status);
		expect(
			span(piu, index === indices[2] ? "◐" : "●", index)?.fg.equals(
				RGBA.fromHex(color),
			),
		).toBe(true);
	}
	const chip = span(piu, " bash ", indices[0]);
	expect(chip?.fg.equals(RGBA.fromHex(lightTheme.surface))).toBe(true);
	expect(chip?.bg.equals(RGBA.fromHex(lightTheme.text))).toBe(true);
	expect((chip?.attributes ?? 0) & TextAttributes.BOLD).toBe(
		TextAttributes.BOLD,
	);
	expect(
		span(piu, "printf", indices[0])?.fg.equals(RGBA.fromHex(lightTheme.text)),
	).toBe(true);
}

test("a multiline user message is bold on raised with a faint you on its first row", async () => {
	await using piu = await startPiu({
		terminalBackground: "light",
		width: 64,
		script: { replies: ["Message received"] },
	});
	await send(piu, "First line\nSecond line");
	const frame = await piu.waitForFrame((f) =>
		chat(f).includes("Message received"),
	);
	const rows = chat(frame).split("\n");
	expect(rows.find((row) => row.includes("First line"))).toMatch(
		/First line +you +$/,
	);
	expect(rows.find((row) => row.includes("Second line"))?.trim()).toBe(
		"Second line",
	);
	for (const text of ["First line", "Second line"]) {
		const message = span(piu, text);
		expect(
			message?.attributes && message.attributes & TextAttributes.BOLD,
		).toBe(TextAttributes.BOLD);
		expect(message?.fg.equals(RGBA.fromHex(lightTheme.text))).toBe(true);
		expect(message?.bg.equals(RGBA.fromHex(lightTheme.raised))).toBe(true);
	}
	const you = span(piu, "you");
	expect(you?.fg.equals(RGBA.fromHex(lightTheme.faint))).toBe(true);
	expect(you?.bg.equals(RGBA.fromHex(lightTheme.raised))).toBe(true);
	expect((you?.attributes ?? 0) & TextAttributes.BOLD).toBe(0);
});

test("three tools share consecutive rows with faint done, error and live statuses", async () => {
	await using piu = await startPiu({
		terminalBackground: "light",
		script: {
			replies: [
				{
					toolCalls: [{ name: "bash", args: { command: "printf first" } }],
				},
				{
					toolCalls: [
						{ name: "read", args: { path: "/nonexistent/swiss-chat.txt" } },
					],
				},
				{
					toolCalls: [
						{ name: "bash", args: { command: "sleep 0.6; printf last" } },
					],
				},
				"Tools finished",
			],
		},
	});
	await send(piu, "Run three");
	const frame = await piu.waitForFrame(
		(f) => chat(f).includes("sleep 0.6") && chat(f).includes("running"),
	);
	foregroundTools(piu, frame);
	await piu.waitForFrame((f) => chat(f).includes("Tools finished"));
});

test("Thinking has a faint chevron and italic muted label without a duration", async () => {
	await using piu = await startPiu({
		terminalBackground: "light",
		script: {
			replies: [{ thinking: "Considering the layout", text: "A plan" }],
		},
	});
	await send(piu, "Think");
	const frame = await piu.waitForFrame((f) => chat(f).includes("A plan"));
	const rows = chat(frame).split("\n");
	const row = rows.findIndex((line) => line.includes("Thinking"));
	expect(rows[row]?.trim()).toBe("▸ Thinking");
	expect(span(piu, "▸", row)?.fg.equals(RGBA.fromHex(lightTheme.faint))).toBe(
		true,
	);
	const label = span(piu, "Thinking", row);
	expect(label?.fg.equals(RGBA.fromHex(lightTheme.muted))).toBe(true);
	expect((label?.attributes ?? 0) & TextAttributes.ITALIC).toBe(
		TextAttributes.ITALIC,
	);
});

test("the welcome heading is bold text rather than accent", async () => {
	await using piu = await startPiu({
		terminalBackground: "light",
		config: { theme: { accent: "#0040c1" } },
		script: { replies: [] },
	});
	await piu.waitForFrame(
		(f) =>
			f.includes("faux-1") && chat(f).includes("What would you like to build?"),
	);
	const heading = span(piu, "What would you like to build?");
	expect(heading?.fg.equals(RGBA.fromHex(lightTheme.text))).toBe(true);
	expect((heading?.attributes ?? 0) & TextAttributes.BOLD).toBe(
		TextAttributes.BOLD,
	);
});

test("subagent statuses use signal while running, faint when settled and error on failure", async () => {
	using control = subagentsControl();
	await using piu = await startPiu({
		terminalBackground: "light",
		installedPiExtensions: [
			join(import.meta.dir, "fixtures/pi-extensions/subagents.ts"),
		],
		backendEnv: control.env,
		script: {
			replies: [
				{
					toolCalls: [
						{
							name: "agent_spawn",
							args: {
								label: "Check colors",
								prompt: "Check colors",
								run_in_background: true,
							},
						},
					],
				},
				"Agent launched",
			],
		},
	});
	await send(piu, "Start");
	await piu.waitForFrame(
		(f) => chat(f).includes("agent @max") && chat(f).includes("Agent launched"),
	);
	for (const [status, color] of [
		["running", lightTheme.signal],
		["idle", lightTheme.faint],
		["done", lightTheme.faint],
		["stopped", lightTheme.faint],
		["failed", lightTheme.error],
	] as const) {
		control.status("max", status);
		const frame = await piu.waitForFrame((f) =>
			chat(f)
				.split("\n")
				.some(
					(row) => row.includes("agent @max") && row.trimEnd().endsWith(status),
				),
		);
		const row = chat(frame)
			.split("\n")
			.findIndex((row) => row.includes("agent @max"));
		expect(span(piu, status, row)?.fg.equals(RGBA.fromHex(color))).toBe(true);
	}
});

test("tools in one reply stay grouped, but text separates the next group and an opened body", async () => {
	const call = (command: string) => ({ name: "bash", args: { command } });
	await using piu = await startPiu({
		script: {
			replies: [
				{
					toolCalls: [
						call("printf FIRST"),
						call("printf MID%s DLE"),
						call("printf THIRD"),
					],
				},
				{ text: "Between groups", toolCalls: [call("printf FOURTH")] },
				"Groups finished",
			],
		},
	});
	await send(piu, "Group these");
	const frame = await piu.waitForFrame((f) =>
		chat(f).includes("Groups finished"),
	);
	const rows = chat(frame).split("\n");
	const indices = rows.flatMap((row, index) =>
		row.includes(" bash ") ? [index] : [],
	);
	expect(indices).toHaveLength(4);
	expect(indices[1]).toBe((indices[0] ?? -1) + 1);
	expect(indices[2]).toBe((indices[1] ?? -1) + 1);
	const between = rows.findIndex((row) => row.includes("Between groups"));
	expect(between).toBeGreaterThan(indices[2] ?? -1);
	expect(indices[3]).toBe(between + 2);
	const middle = indices[1] ?? -1;
	const panel = agentPanel(piu);
	await piu.mockMouse.click(
		panel.x + 2 + (rows[middle] ?? "").indexOf("bash"),
		panel.y + 1 + middle,
	);
	const open = await piu.waitForFrame((f) => chat(f).includes("MIDDLE"));
	const openedRows = chat(open).split("\n");
	const header = openedRows.findIndex((row) => row.includes("MID%s DLE"));
	expect(openedRows[header + 1]?.trim()).toBe("");
	expect(openedRows[header + 2]).toContain("{");
});

test("background tool cards keep job labels with signal, faint and error colors", async () => {
	using job = blocker("swiss-background");
	await using piu = await startPiu({
		terminalBackground: "light",
		installedPiExtensions: [
			join(import.meta.dir, "fixtures/pi-extensions/shell-background.ts"),
		],
		backendEnv: { PIU_STANDIN_DELIVER: "0" },
		script: {
			replies: [
				{
					toolCalls: [
						{ name: "bash", args: { command: job.command, background: true } },
					],
				},
				"Job launched",
				{
					toolCalls: [
						{ name: "bash", args: { command: "exit 1", background: true } },
					],
				},
				"Failure launched",
			],
		},
	});
	await send(piu, "Background");
	for (const [label, color] of [
		["bg-1 running", lightTheme.signal],
		["bg-1 done", lightTheme.faint],
		["bg-2 failed", lightTheme.error],
	] as const) {
		const frame = await piu.waitForFrame(
			(f) =>
				chat(f).includes(label) &&
				chat(f).includes(
					label === "bg-2 failed" ? "Failure launched" : "Job launched",
				),
		);
		const row = chat(frame)
			.split("\n")
			.findIndex((line) => line.includes(" bash ") && line.includes(label));
		expect(row).toBeGreaterThanOrEqual(0);
		expect(span(piu, label, row)?.fg.equals(RGBA.fromHex(color))).toBe(true);
		if (label === "bg-1 running") job.release();
		if (label === "bg-1 done") await send(piu, "Fail a job");
	}
});

test("a Backend failure already uses the error token", async () => {
	await using piu = await startPiu({
		terminalBackground: "light",
		script: {
			replies: [],
			crash: { code: 3, stderr: "Backend color check\n" },
		},
	});
	await send(piu, "/crash");
	await piu.waitForFrame(
		(f) =>
			chat(f).includes("Restart") &&
			chat(f).includes("Backend exited with code 3"),
	);
	expect(
		span(piu, "Backend exited with code 3")?.fg.equals(
			RGBA.fromHex(lightTheme.error),
		),
	).toBe(true);
});
