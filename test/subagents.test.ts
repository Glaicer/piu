import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLive } from "../src/subagents.ts";
import {
	focusedPanels,
	modalBounds,
	panelText,
	startPiu,
	working,
} from "./harness.ts";
import { subagentsControl } from "./subagents-control.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;
type Script = Parameters<typeof startPiu>[0]["script"];

const standIn = join(import.meta.dir, "fixtures/pi-extensions/subagents.ts");
const reporter = join(import.meta.dir, "../builtin/chat/subagent-live.ts");
const agentPanel = (frame: string) => panelText(frame, 10);

const spawn = (label: string, background = true, prompt = `Do: ${label}`) => ({
	toolCalls: [
		{
			name: "agent_spawn",
			args: { prompt, label, run_in_background: background },
		},
	],
});

function start(
	control: ReturnType<typeof subagentsControl>,
	script: Script,
	options?: Partial<Parameters<typeof startPiu>[0]>,
) {
	return startPiu({
		installedPiExtensions: [standIn],
		backendEnv: control.env,
		...options,
		script,
	});
}

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const cards = (frame: string, text = "") =>
	agentPanel(frame)
		.split("\n")
		.filter((line) => /^\W*agent @\w+ /.test(line) && line.includes(text));

test("a background subagent has a card with its id, task and status that stays running after the spawn call and the turn are over", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});

	await send(piu, "Go");
	const frame = await piu.waitForFrame(
		(f) =>
			cards(f, "Audit the auth code").length === 1 &&
			f.includes("Spawned it") &&
			!working(f),
	);

	expect(cards(frame)[0]).toMatch(/agent @max +Audit the auth code +running/);
});

test("a foreground subagent has a card while the spawn call is still blocked, and the card shows the end", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Count the files", false), "Counted"],
	});

	await send(piu, "Go");
	const running = await piu.waitForFrame(
		(f) => cards(f, "Count the files").length === 1,
	);
	expect(cards(running)[0]).toContain("running");
	expect(running).not.toContain("Counted");

	control.status("max", "done", "42 files");

	const frame = await piu.waitForFrame((f) => f.includes("Counted"));
	expect(cards(frame)).toHaveLength(1);
	expect(cards(frame)[0]).toMatch(/@max +Count the files +done/);
});

const readCall = (id: string) => ({
	type: "toolCall" as const,
	id,
	name: "read",
	arguments: { path: "src/auth.ts" },
});

async function clickCard(piu: Piu, frame: string, id: string) {
	const rows = frame.split("\n");
	const y = rows.findIndex((line) => line.includes(`agent @${id} `));
	await piu.mockMouse.click((rows[y] ?? "").indexOf(`agent @${id}`) + 1, y);
}

async function clickText(piu: Piu, frame: string, text: string) {
	const rows = frame.split("\n");
	const y = rows.findIndex((line) => line.includes(text));
	await piu.mockMouse.click((rows[y] ?? "").indexOf(text), y);
}

const spawned = (f: string, ...ids: string[]) =>
	ids.every((id) => cards(f).some((line) => line.includes(`@${id} `)));

test("clicking a card opens that subagent's messages and tool calls, and later output appears in the open view without reopening", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max") && f.includes("Spawned it"),
	);
	control.say("max", "Reading the sources", readCall("c1"));
	control.toolResult("max", "c1", "export const auth = 1");

	await clickCard(piu, base, "max");

	const open = await piu.waitForFrame(
		(f) => f.includes("Reading the sources") && f.includes(" read"),
	);
	expect(open).toMatch(/> Do: Audit the auth code/);
	expect(open).toMatch(/ read .*src\/auth\.ts.* done/);
	expect(open).not.toContain("[sending]");
	expect(open).not.toContain("export const auth = 1");

	await clickText(piu, open, " read");
	await piu.waitForFrame((f) => f.includes("export const auth = 1"));

	control.say("max", "Found a second problem");
	await piu.waitForFrame((f) => f.includes("Found a second problem"));

	await piu.mockMouse.click(0, 0);
	const closed = await piu.waitForFrame(
		(f) => !f.includes("Reading the sources"),
	);
	expect(cards(closed)[0]).toContain("running");
	expect(closed).not.toContain("[sending]");
});

test("the subagent view fills the middle three quarters of the terminal and follows a resize", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max") && f.includes("Spawned it"),
	);
	control.say("max", "Reading the sources");

	await clickCard(piu, base, "max");
	await piu.waitForFrame((f) => f.includes("Reading the sources"));
	expect(modalBounds(piu)).toEqual({
		left: 20,
		top: 4,
		width: 120,
		height: 22,
	});

	piu.resize(100, 40);
	await piu.waitForFrame(
		(f) => modalBounds(piu)?.width === 75 && f.includes("Reading the sources"),
	);
	expect(modalBounds(piu)).toEqual({ left: 13, top: 5, width: 75, height: 30 });
});

test("a card can be selected and opened by keyboard, and Esc closes the view without touching the subagent", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => spawned(f, "max") && f.includes("Spawned it"));
	control.say("max", "Reading the sources");

	piu.mockInput.pressTab({ shift: true });
	await piu.waitForFrame((f) => focusedPanels(piu, f).includes("agent"));
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => f.includes("› agent_spawn"));
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => f.includes("› agent @max"));
	piu.mockInput.pressEnter();

	await piu.waitForFrame((f) => f.includes("Reading the sources"));
	piu.mockInput.pressEscape();

	const closed = await piu.waitForFrame(
		(f) => !f.includes("Reading the sources"),
	);
	expect(cards(closed)[0]).toContain("running");
	expect(closed).not.toContain("[sending]");
});

test("several subagents with the same task title stay separate in cards and views", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Same task"), spawn("Same task"), "Both started"],
	});
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max", "zoe") && f.includes("Both started"),
	);
	control.say("max", "Alpha only");
	control.say("zoe", "Beta only");
	control.status("zoe", "failed", "boom");

	const settled = await piu.waitForFrame((f) =>
		cards(f).some((line) => line.includes("@zoe") && line.includes("failed")),
	);
	expect(cards(settled).find((l) => l.includes("@max"))).toContain("running");

	await clickCard(piu, base, "zoe");
	const zoe = await piu.waitForFrame((f) => f.includes("Beta only"));
	expect(zoe).not.toContain("Alpha only");
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("Beta only"));

	await clickCard(piu, base, "max");
	const max = await piu.waitForFrame((f) => f.includes("Alpha only"));
	expect(max).not.toContain("Beta only");
});

test("cards and an open view show the real end: resident idle is not working, failures and stops are told apart, and nothing is duplicated", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("One"), spawn("Two"), spawn("Three"), "All started"],
	});
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max", "zoe", "kai") && f.includes("All started"),
	);
	control.say("max", "Working on it");
	await clickCard(piu, base, "max");
	const working = await piu.waitForFrame((f) => f.includes("Working on it"));
	expect(working).toMatch(/agent @max +One +running/);

	control.status("max", "idle");
	control.status("zoe", "failed");
	control.status("kai", "stopped");

	const frame = await piu.waitForFrame((f) => /agent @max +One +idle/.test(f));
	expect(frame).not.toMatch(/@max .*running/);
	expect(frame).toContain("Working on it");
	piu.mockInput.pressEscape();
	const closed = await piu.waitForFrame(
		(f) =>
			/@max +One +idle/.test(f) &&
			/@zoe +Two +failed/.test(f) &&
			/@kai +Three +stopped/.test(f),
	);
	expect(cards(closed)).toHaveLength(3);
});

test("a new session does not inherit the previous session's subagents", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => spawned(f, "max") && f.includes("Spawned it"));

	await send(piu, "/new");

	await piu.waitForFrame((f) => !f.includes("Spawned it"));
	control.say("max", "Late output of the old session");
	await Bun.sleep(600);
	await piu.renderOnce();
	expect(cards(piu.captureCharFrame())).toHaveLength(0);
});

test("a session the Backend replaces on its own does not inherit the previous session's subagents either", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
		freshSessionCommand: true,
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => spawned(f, "max") && f.includes("Spawned it"));

	await send(piu, "/fresh");

	await piu.waitForFrame((f) => cards(f).length === 0);
	control.say("max", "Late output of the old session");
	await Bun.sleep(600);
	await piu.renderOnce();
	expect(cards(piu.captureCharFrame())).toHaveLength(0);
});

test("without a subagent source the chat shows no card", async () => {
	await using piu = await startPiu({ script: { replies: ["Plain answer"] } });
	await send(piu, "Hi");
	const frame = await piu.waitForFrame((f) => f.includes("Plain answer"));
	expect(cards(frame)).toHaveLength(0);
});

test("the view follows new output at the bottom, and keeps its place when the reader has scrolled up", async () => {
	using control = subagentsControl();
	await using piu = await start(
		control,
		{ replies: [spawn("Job"), "Spawned it"] },
		{ width: 220 },
	);
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max") && f.includes("Spawned it"),
	);
	for (let i = 1; i <= 60; i++) control.say("max", `Line ${i}`);
	await clickCard(piu, base, "max");

	const bottom = await piu.waitForFrame((f) => f.includes("Line 60"));
	expect(bottom).not.toContain("Line 1\n");
	control.say("max", "Line 61");
	await piu.waitForFrame((f) => f.includes("Line 61"));

	for (let i = 0; i < 10; i++) await piu.mockMouse.scroll(60, 10, "up");
	const scrolled = await piu.waitForFrame((f) => !f.includes("Line 61"));
	control.say("max", "Line 62");
	control.status("max", "idle");
	const held = await piu.waitForFrame(
		(f) => cards(f, "Job")[0]?.includes("idle") === true,
	);
	expect(held).not.toContain("Line 62");
	expect(held).toContain(scrolled.match(/Line \d+/)?.[0] ?? "Line ?");

	for (let i = 0; i < 30; i++) await piu.mockMouse.scroll(60, 10, "down");
	await piu.waitForFrame((f) => f.includes("Line 62"));
});

test("a resident subagent that is idle for a long time shows working again when the model wakes it", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [
			spawn("Resident job"),
			"Spawned it",
			{
				toolCalls: [
					{ name: "agent_send", args: { to: "max", message: "Next task" } },
				],
			},
			"Sent it",
		],
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => spawned(f, "max") && f.includes("Spawned it"));
	control.status("max", "idle");
	await piu.waitForFrame(
		(f) => cards(f, "Resident job")[0]?.includes("idle") === true,
	);
	await Bun.sleep(3500);

	await send(piu, "Wake it");

	const frame = await piu.waitForFrame((f) => f.includes("Sent it"));
	expect(cards(frame, "Resident job")[0]).toContain("running");
});

test("a child's launch carries the live reporter and the folder it writes to", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	await piu.waitForFrame((f) => spawned(f, "max") && f.includes("Spawned it"));

	const launch = control.launch("max");

	expect(launch.extensions).toEqual([reporter]);
	expect(existsSync(launch.env.PIU_SUBAGENT_LIVE_DIR as string)).toBe(true);
});

test("an open view shows the message the child is still streaming, before the child's session has it", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max") && f.includes("Spawned it"),
	);
	await clickCard(piu, base, "max");

	control.live("max", 1000, "Half a sent");
	await piu.waitForFrame((f) => f.includes("Half a sent"));
	control.live("max", 1000, "Half a sentence, then a tool", readCall("c1"));

	const frame = await piu.waitForFrame((f) => / read .*src\/auth\.ts/.test(f));
	expect(frame).toContain("Half a sentence, then a tool");
});

test("a message saved to the child's session replaces its live snapshot and shows once", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max") && f.includes("Spawned it"),
	);
	await clickCard(piu, base, "max");
	control.live("max", 1000, "Partial draft");
	await piu.waitForFrame((f) => f.includes("Partial draft"));

	control.sayAt("max", 1000, "Final answer");
	control.say("max", "Next message");

	const frame = await piu.waitForFrame((f) => f.includes("Next message"));
	expect(frame).not.toContain("Partial draft");
	expect(frame.split("Final answer")).toHaveLength(2);
});

test("a live snapshot of a newer message shows after the saved ones", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max") && f.includes("Spawned it"),
	);
	await clickCard(piu, base, "max");
	control.sayAt("max", 1000, "First done");
	control.live("max", 2000, "Second in progress");

	const frame = await piu.waitForFrame(
		(f) => f.includes("First done") && f.includes("Second in progress"),
	);
	expect(frame.indexOf("First done")).toBeLessThan(
		frame.indexOf("Second in progress"),
	);
});

test("the reporter writes the reply a real Pi is still streaming, and the whole reply when it ends", async () => {
	const live = mkdtempSync(join(tmpdir(), "piu-live-"));
	try {
		const reply = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
		await using piu = await startPiu({
			script: { replies: [reply], tokensPerSecond: 20, tokenSize: 1 },
			extraBackendArgs: ["-e", reporter],
			backendEnv: {
				PI_SUBAGENT_AGENT_ID: "max",
				PIU_SUBAGENT_LIVE_DIR: live,
			},
		});
		const snapshot = () => {
			try {
				return parseLive(readFileSync(join(live, "max.json"), "utf8"));
			} catch {
				return undefined;
			}
		};
		const textOf = () =>
			snapshot()
				?.entries.map((entry) => ("text" in entry ? entry.text : ""))
				.join("") ?? "";

		await send(piu, "Go");
		await piu.waitForFrame(() => textOf().includes("word1"));
		const partial = textOf();
		expect(reply.startsWith(partial)).toBe(true);
		expect(partial.length).toBeLessThan(reply.length);

		await piu.waitForFrame(() => textOf() === reply);
		expect(typeof snapshot()?.timestamp).toBe("number");
	} finally {
		rmSync(live, { recursive: true, force: true });
	}
});

test("the view folds thinking and tool results like the main chat, and a click or the keyboard opens them", async () => {
	using control = subagentsControl();
	await using piu = await start(control, {
		replies: [spawn("Audit the auth code"), "Spawned it"],
	});
	await send(piu, "Go");
	const base = await piu.waitForFrame(
		(f) => spawned(f, "max") && f.includes("Spawned it"),
	);
	control.say(
		"max",
		{ type: "thinking", thinking: "Weighing the options" },
		"Here is my answer",
		readCall("c1"),
	);
	control.toolResult("max", "c1", "export const auth = 1");
	await clickCard(piu, base, "max");

	const folded = await piu.waitForFrame(
		(f) => f.includes("Here is my answer") && f.includes(" read"),
	);
	expect(folded).toContain("▸ Thinking");
	expect(folded).not.toContain("Weighing the options");
	expect(folded).not.toContain("export const auth = 1");

	await clickText(piu, folded, "▸ Thinking");
	const thought = await piu.waitForFrame((f) =>
		f.includes("Weighing the options"),
	);
	expect(thought).toContain("▾ Thinking");

	piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => f.includes("› ▾ Thinking"));
	piu.mockInput.pressArrow("down");
	await piu.waitForFrame((f) => f.includes("› read"));
	piu.mockInput.pressEnter();
	const open = await piu.waitForFrame((f) =>
		f.includes("export const auth = 1"),
	);
	expect(open).toContain("› read");
});
