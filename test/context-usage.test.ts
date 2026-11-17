import { expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RGBA, TextAttributes } from "@opentui/core";
import {
	alignContextBreakdown,
	estimateContext,
} from "../builtin/context/usage.ts";
import {
	CONTEXT_CATEGORIES,
	type ContextCategory,
} from "../src/context-usage.ts";
import { lightTheme } from "../src/theme.ts";
import {
	type FauxScript,
	glyphs,
	inputArea,
	modalBounds,
	modalText,
	panelText,
	startPiu,
	working,
} from "./harness.ts";
import { hooks } from "./hooks.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

type UsageFrame = {
	window: number;
	used: number;
	free: number;
	rows: Record<ContextCategory, { tokens: number; percent: number }>;
};

const agentPanel = (frame: string) => panelText(frame, 10, 0);
const extensions = join(import.meta.dir, "fixtures/extensions");
const piExtensions = join(import.meta.dir, "fixtures/pi-extensions");

function fixture(script: FauxScript) {
	return {
		script,
		installedPiExtensions: [join(piExtensions, "context-usage.ts")],
		extensions,
		config: { placement: { status: ["probe.capture"] } },
	};
}

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

async function openContext(piu: Piu): Promise<string> {
	await send(piu, "/context");
	return piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("Window:"),
		8000,
	);
}

function readUsage(piu: Piu, frame: string): UsageFrame {
	const text = modalText(piu, frame);
	const count = (pattern: RegExp, label: string) => {
		const found = pattern.exec(text);
		if (!found) throw new Error(`No ${label} in the Modal:\n${text}`);
		return Number(found[1]);
	};
	const rows = Object.fromEntries(
		CONTEXT_CATEGORIES.map(({ id, label }) => {
			const found = new RegExp(`${label}\\s+(\\d+) tokens\\s+([\\d.]+)%`).exec(
				text,
			);
			if (!found) throw new Error(`No ${label} row in the Modal:\n${text}`);
			return [id, { tokens: Number(found[1]), percent: Number(found[2]) }];
		}),
	) as UsageFrame["rows"];
	return {
		window: count(/Window: (\d+) tokens/, "window"),
		used: count(/Used: (\d+) tokens/, "used"),
		free: count(/Free: (\d+) tokens/, "free"),
		rows,
	};
}

function total(rows: UsageFrame["rows"]): number {
	return CONTEXT_CATEGORIES.reduce((sum, { id }) => sum + rows[id].tokens, 0);
}

async function oracle(piu: Piu): Promise<{
	tokens: number | null;
	contextWindow: number;
}> {
	const path = `${join(piu.dir, "script.json")}.context-oracle.json`;
	rmSync(path, { force: true });
	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	await actions.prompt("/context-oracle");
	const deadline = Date.now() + 4000;
	while (!existsSync(path)) {
		if (Date.now() > deadline)
			throw new Error("The oracle command wrote no usage.");
		await Bun.sleep(10);
	}
	const value = JSON.parse(readFileSync(path, "utf8"));
	return { tokens: value.tokens ?? null, contextWindow: value.contextWindow };
}

test("context before the first turn is an estimate and does not call the model", async () => {
	await using piu = await startPiu({
		script: { replies: ["Seen {messages}", "Unexpected second reply"] },
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));

	const frame = await openContext(piu);
	const usage = readUsage(piu, frame);
	const text = modalText(piu, frame);
	expect(usage.window).toBe(128000);
	expect(text).toContain("Session estimate");
	expect(text).toContain("Total estimated from the session");
	expect(usage.rows.system.tokens).toBeGreaterThan(0);
	expect(usage.rows.tools.tokens).toBeGreaterThan(0);
	expect(usage.rows.messages.tokens).toBe(0);
	expect(usage.used).toBe(
		usage.rows.system.tokens +
			usage.rows.tools.tokens +
			usage.rows.skills.tokens +
			usage.rows.messages.tokens +
			usage.rows.other.tokens,
	);

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !modalText(piu, f).includes("Window:"));
	await send(piu, "Hello");
	const after = await piu.waitForFrame(
		(f) => agentPanel(f).includes("Seen 1") && !working(f),
	);
	expect(agentPanel(after)).not.toContain("Unexpected second reply");
}, 20000);

test("context after a turn agrees with Pi including cached and output tokens", async () => {
	await using piu = await startPiu({
		...fixture({
			replies: [`Main answer. ${"More of the answer. ".repeat(80)}`],
		}),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Main answer.") && !working(frame),
	);

	const frame = await openContext(piu);
	const usage = readUsage(piu, frame);
	const text = modalText(piu, frame);
	const pi = await oracle(piu);
	expect(pi.tokens).toBeNumber();
	expect(usage.window).toBe(pi.contextWindow);
	expect(usage.used).toBe(pi.tokens ?? 0);
	for (const id of ["system", "tools", "messages", "other"] as const) {
		expect(usage.rows[id].tokens).toBeGreaterThan(0);
	}
	expect(total(usage.rows)).toBe(usage.used);
	expect(usage.free).toBe(usage.window - usage.used);
	for (const { id } of CONTEXT_CATEGORIES) {
		expect(usage.rows[id].percent).toBe(
			Number(((usage.rows[id].tokens / usage.window) * 100).toFixed(1)),
		);
	}
	expect(text).toContain("Last request");
	expect(text).toContain("Total from Pi");
	expect(text).toContain("estimated");
	expect(frame).not.toContain('{"v":1');
}, 20000);

test("skills are separate from the system prompt", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-context-"));
	const turn = async (skills: boolean) => {
		await using piu = await startPiu({
			...fixture({ replies: ["Answer"] }),
			dir,
			backendEnv: skills ? { PIU_CONTEXT_SKILLS: "1" } : {},
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		await send(piu, "Count the skills");
		await piu.waitForFrame(
			(frame) => agentPanel(frame).includes("Answer") && !working(frame),
		);
		return readUsage(piu, await openContext(piu));
	};
	try {
		const plain = await turn(false);
		const withSkills = await turn(true);
		expect(withSkills.rows.skills.tokens).toBe(
			Math.ceil((4096 + "<skills>\n".length + "\n</skills>".length) / 4),
		);
		for (const usage of [plain, withSkills]) {
			expect(total(usage.rows)).toBe(usage.used);
		}
		expect(withSkills.rows.system.tokens).toBe(plain.rows.system.tokens);
		expect(withSkills.rows.skills.tokens).toBeGreaterThan(
			plain.rows.skills.tokens,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 30000);

test("context includes request-only messages absent from the saved session", async () => {
	await using piu = await startPiu({
		...fixture({ replies: ["Answer"] }),
		persistSession: true,
		backendEnv: { PIU_CONTEXT_TRANSIENT: "1" },
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Original prompt");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);

	const pi = await oracle(piu);
	const usage = readUsage(piu, await openContext(piu));
	expect(usage.rows.messages.tokens).toBeGreaterThan(2048);
	expect(usage.used).toBe(pi.tokens ?? 0);

	const sessions = join(piu.dir, "agent", "sessions");
	const saved = [...new Bun.Glob("**/*.jsonl").scanSync({ cwd: sessions })]
		.map((name) => readFileSync(join(sessions, name), "utf8"))
		.join("\n");
	expect(saved).toContain("Original prompt");
	expect(saved).not.toContain("REQUEST_ONLY_");
}, 20000);

test("category estimates scale to a smaller Pi total without losing tokens", async () => {
	await using piu = await startPiu({
		...fixture({ replies: ["Answer"] }),
		backendEnv: {
			PIU_CONTEXT_MINIMAL: "1",
			PIU_CONTEXT_USAGE_TOTAL: "7",
		},
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "UUUU");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);

	const pi = await oracle(piu);
	const frame = await openContext(piu);
	const usage = readUsage(piu, frame);
	expect(pi.tokens).toBe(7);
	expect(usage.used).toBe(7);
	expect(usage.rows.tools.tokens).toBe(0);
	expect(total(usage.rows)).toBe(7);
	for (const { id } of CONTEXT_CATEGORIES) {
		expect(usage.rows[id].tokens).toBeGreaterThanOrEqual(0);
		expect(usage.rows[id].percent).toBe(
			Number(((usage.rows[id].tokens / usage.window) * 100).toFixed(1)),
		);
	}
	expect(usage.free).toBe(usage.window - 7);
	expect(modalText(piu, frame)).toContain("Total from Pi");
}, 20000);

test("an opaque system prompt keeps its skills block out of the system estimate", () => {
	const breakdown = estimateContext([
		{
			role: "system",
			content: `${"s".repeat(400)}<skills>${"k".repeat(16)}</skills>`,
			timestamp: 0,
		},
	]);
	expect(breakdown).toEqual({
		system: 100,
		tools: 0,
		skills: Math.ceil(("<skills>".length + 16 + "</skills>".length) / 4),
		messages: 0,
		other: 0,
	});
});

test("a breakdown larger than Pi's total is scaled without losing tokens", () => {
	const scaled = alignContextBreakdown(
		{ system: 100, tools: 0, skills: 9, messages: 1, other: 0 },
		7,
	);
	expect(scaled).toEqual({
		system: 6,
		tools: 0,
		skills: 1,
		messages: 0,
		other: 0,
	});
	const roomy = alignContextBreakdown(
		{ system: 100, tools: 10, skills: 5, messages: 1, other: 0 },
		200,
	);
	expect(roomy).toEqual({
		system: 100,
		tools: 10,
		skills: 5,
		messages: 1,
		other: 84,
	});
	expect(
		alignContextBreakdown(
			{ system: 0, tools: 0, skills: 0, messages: 0, other: 0 },
			9,
		),
	).toEqual({ system: 0, tools: 0, skills: 0, messages: 0, other: 9 });
	for (const used of [0, 1, 7, 20, 200]) {
		const aligned = alignContextBreakdown(
			{ system: 100, tools: 10, skills: 9, messages: 1, other: 0 },
			used,
		);
		expect(
			CONTEXT_CATEGORIES.reduce((sum, { id }) => sum + aligned[id], 0),
		).toBe(used);
	}
});

test("context describes the final request after a tool result", async () => {
	await using piu = await startPiu({
		...fixture({
			replies: [
				{
					toolCalls: [
						{
							name: "bash",
							args: { command: "head -c 8192 /dev/zero | tr \\0 x" },
						},
					],
				},
				"Final reply",
			],
		}),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Run it");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Final reply") && !working(frame),
	);

	const pi = await oracle(piu);
	const usage = readUsage(piu, await openContext(piu));
	expect(usage.rows.messages.tokens).toBeGreaterThan(2048);
	expect(usage.used).toBe(pi.tokens ?? 0);
}, 20000);

test("btw does not replace the main context snapshot", async () => {
	await using piu = await startPiu({
		...fixture({ replies: ["Main answer", "Side answer"] }),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Main answer") && !working(frame),
	);
	const before = readUsage(piu, await openContext(piu));

	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	await actions.prompt(`/btw ${"long side question ".repeat(40)}`);
	await piu.waitForFrame((frame) =>
		modalText(piu, frame).includes("Side answer"),
	);
	piu.mockInput.pressEscape();
	await piu.waitForFrame(
		(frame) => !modalText(piu, frame).includes("Side answer"),
	);

	const after = readUsage(piu, piu.captureCharFrame());
	expect(after).toEqual(before);
	const pi = await oracle(piu);
	expect(after.used).toBe(pi.tokens ?? 0);
}, 20000);

test("piu context wins over an installed command and hides its transport command", async () => {
	await using piu = await startPiu({
		...fixture({ replies: ["Sentinel reply"] }),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));

	await piu.mockInput.typeText("/context");
	const list = await piu.waitForFrame(
		(frame) => frame.includes("/context-oracle"),
		8000,
	);
	const rows = list.split("\n").filter((line) => /^\s+\/context\s/.test(line));
	expect(rows).toHaveLength(1);

	piu.mockInput.pressEnter();
	const frame = await openContext(piu);
	expect(frame).not.toContain("Installed context command invoked");
	expect(agentPanel(frame)).not.toContain("Sentinel reply");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !modalText(piu, f).includes("Window:"));
	await piu.mockInput.typeText("/piu-context");
	await piu.waitForFrame((f) => inputArea(f).includes("/piu-context"));
	// why: the `/` list renders over the Panels, so absence is asserted on several frames after the typed text settled rather than on the first one.
	for (let pass = 0; pass < 3; pass++) {
		await piu.renderOnce();
		expect(piu.captureCharFrame()).not.toMatch(/^\s+\/piu-context/m);
	}
}, 20000);

test("manual compaction hides numbers then shows a fresh session estimate", async () => {
	await using piu = await startPiu({
		...fixture({
			replies: [
				"First answer",
				"Second answer",
				"Summary one",
				"Summary two",
				"After answer",
			],
		}),
		backendEnv: { PIU_CONTEXT_COMPACTION_GATE: "1" },
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "First");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("First answer") && !working(frame),
	);
	await send(piu, "Second");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Second answer") && !working(frame),
	);

	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	void actions.compact();
	const releasing = `${join(piu.dir, "script.json")}.context-release`;
	await piu.waitForFrame(() =>
		existsSync(`${join(piu.dir, "script.json")}.context-compacting`),
	);
	await send(piu, "/context");
	const compacting = await piu.waitForFrame((frame) =>
		modalText(piu, frame).includes("Compacting context…"),
	);
	expect(modalText(piu, compacting)).not.toContain("Used:");

	writeFileSync(releasing, "");
	const fresh = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("Session estimate"),
		8000,
	);
	expect(modalText(piu, fresh)).not.toContain("Last request");
	const pi = await oracle(piu);
	expect(pi.tokens).toBeNull();

	piu.mockInput.pressEscape();
	await piu.waitForFrame(
		(f) => !modalText(piu, f).includes("Session estimate"),
	);
	await send(piu, "After");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("After answer") && !working(frame),
	);
	const usage = readUsage(piu, await openContext(piu));
	const after = await oracle(piu);
	expect(usage.used).toBe(after.tokens ?? 0);
	expect(modalText(piu, piu.captureCharFrame())).toContain("Last request");
}, 20000);

test("automatic compaction hides numbers while its gate is held", async () => {
	await using piu = await startPiu({
		...fixture({
			contextWindow: 10000,
			replies: ["First answer", "Summary one", "Summary two"],
		}),
		backendEnv: {
			PIU_CONTEXT_COMPACTION_GATE: "1",
			PIU_CONTEXT_USAGE_TOTAL: "20000",
		},
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const script = join(piu.dir, "script.json");
	await send(piu, "Hello");
	await piu.waitForFrame(
		() => existsSync(`${script}.context-compacting`),
		8000,
	);

	await send(piu, "/context");
	const compacting = await piu.waitForFrame((frame) =>
		modalText(piu, frame).includes("Compacting context…"),
	);
	expect(modalText(piu, compacting)).not.toContain("Used:");
	expect(modalText(piu, compacting)).not.toContain("20000");

	writeFileSync(`${script}.context-release`, "");
	const fresh = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("Session estimate"),
		8000,
	);
	expect(modalText(piu, fresh)).not.toContain("20000");
	expect(modalText(piu, fresh)).not.toContain("Last request");
}, 20000);

test("failed compaction restores the last request instead of staying busy", async () => {
	await using piu = await startPiu({
		...fixture({
			replies: [
				"First answer",
				"Second answer",
				{ error: "400 invalid request" },
			],
		}),
		backendEnv: { PIU_CONTEXT_COMPACTION_GATE: "1" },
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "First");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("First answer") && !working(frame),
	);
	await send(piu, "Second");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Second answer") && !working(frame),
	);
	const before = readUsage(piu, await openContext(piu));

	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	const script = join(piu.dir, "script.json");
	void actions.compact();
	await piu.waitForFrame(
		() => existsSync(`${script}.context-compacting`),
		8000,
	);
	const compacting = await piu.waitForFrame((frame) =>
		modalText(piu, frame).includes("Compacting context…"),
	);
	expect(modalText(piu, compacting)).not.toContain("Used:");

	writeFileSync(`${script}.context-release`, "");
	const restored = await piu.waitForFrame(
		(frame) =>
			modalText(piu, frame).includes("Last request") &&
			modalText(piu, frame).includes("Used:"),
		8000,
	);
	expect(readUsage(piu, restored)).toEqual(before);
	const pi = await oracle(piu);
	expect(before.used).toBe(pi.tokens ?? 0);
}, 20000);

test("a new session closes context and forgets the old request", async () => {
	await using piu = await startPiu({
		...fixture({ replies: ["Seen {messages}", "Unused reply"] }),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Seen 1") && !working(frame),
	);
	const first = await openContext(piu);
	expect(modalText(piu, first)).toContain("Last request");

	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	await actions.newSession();
	await piu.waitForFrame(
		(frame) => !modalText(piu, frame).includes("Window:"),
		8000,
	);

	const frame = await openContext(piu);
	const usage = readUsage(piu, frame);
	expect(modalText(piu, frame)).toContain("Session estimate");
	expect(usage.rows.messages.tokens).toBe(0);

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !modalText(piu, f).includes("Window:"));
	await send(piu, "Again");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Seen 1") && !working(frame),
	);
}, 20000);

test("resuming a session estimates its current projection until a new request", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-context-"));
	try {
		{
			await using first = await startPiu({
				...fixture({ replies: ["First answer"] }),
				dir,
				persistSession: true,
			});
			await first.waitForFrame((frame) => frame.includes("faux-1"));
			await send(first, "Hello");
			await first.waitForFrame(
				(frame) =>
					agentPanel(frame).includes("First answer") && !working(frame),
			);
		}
		await using piu = await startPiu({
			...fixture({ replies: ["Second answer"] }),
			dir,
			persistSession: true,
			args: ["--model", "faux/faux-1", "-c"],
		});
		await piu.waitForFrame((frame) => frame.includes("faux-1"));
		const frame = await openContext(piu);
		const usage = readUsage(piu, frame);
		const pi = await oracle(piu);
		expect(modalText(piu, frame)).toContain("Session estimate");
		expect(usage.rows.messages.tokens).toBeGreaterThan(0);
		expect(usage.used).toBe(pi.tokens ?? 0);

		piu.mockInput.pressEscape();
		await piu.waitForFrame(
			(f) => !modalText(piu, f).includes("Session estimate"),
		);
		await send(piu, "Again");
		await piu.waitForFrame(
			(frame) => agentPanel(frame).includes("Second answer") && !working(frame),
		);
		const resumed = await openContext(piu);
		const after = await oracle(piu);
		expect(modalText(piu, resumed)).toContain("Last request");
		expect(readUsage(piu, resumed).used).toBe(after.tokens ?? 0);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 30000);

test("changing the model refreshes context without reopening it", async () => {
	await using piu = await startPiu({
		...fixture({
			replies: ["First answer"],
			sameIdProvider: true,
			contextWindow: 10000,
		}),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("First answer") && !working(frame),
	);
	const before = readUsage(piu, await openContext(piu));
	expect(before.window).toBe(10000);
	const bounds = modalBounds(piu);

	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	await actions.setModel({ provider: "other", id: "faux-1", name: "Other" });
	const frame = await piu.waitForFrame((f) =>
		modalText(piu, f).includes("other/faux-1"),
	);
	const pi = await oracle(piu);
	const usage = readUsage(piu, frame);
	expect(usage.window).toBe(pi.contextWindow);
	expect(usage.window).not.toBe(before.window);
	expect(modalBounds(piu)).toEqual(bounds);
	expect(modalText(piu, frame)).toContain("Session estimate");
	expect(modalText(piu, frame)).not.toContain("Last request");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !modalText(piu, f).includes("Window:"), 8000);
	expect(modalBounds(piu)).toBeUndefined();
}, 20000);

test("Escape closes context and returns typing to the input", async () => {
	await using piu = await startPiu({
		...fixture({ replies: ["First answer", "Second answer"] }),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("First answer") && !working(frame),
	);
	await openContext(piu);
	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !modalText(piu, f).includes("Window:"));

	await piu.mockInput.typeText("MARKER");
	const typed = await piu.waitForFrame((f) => inputArea(f).includes("MARKER"));
	expect(agentPanel(typed)).not.toContain("MARKER");

	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	await actions.prompt("Again");
	const updated = await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Second answer") && !working(frame),
	);
	expect(modalBounds(piu)).toBeUndefined();
	expect(inputArea(updated)).toContain("MARKER");

	for (let index = 0; index < "MARKER".length; index++)
		piu.mockInput.pressBackspace();
	await piu.waitForFrame((f) => !inputArea(f).includes("MARKER"));
	await openContext(piu);
	expect(modalBounds(piu)).toBeDefined();
}, 20000);

test("an outside click closes context and returns typing to the input", async () => {
	await using piu = await startPiu({
		...fixture({ replies: ["First answer", "Second answer"] }),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("First answer") && !working(frame),
	);
	await openContext(piu);
	const bounds = modalBounds(piu);
	if (!bounds) throw new Error("The Context Modal is not open.");
	await piu.mockMouse.click(bounds.left + bounds.width + 2, bounds.top);
	await piu.waitForFrame((f) => !modalText(piu, f).includes("Window:"));
	expect(modalBounds(piu)).toBeUndefined();

	await piu.mockInput.typeText("CLICKED");
	const typed = await piu.waitForFrame((f) => inputArea(f).includes("CLICKED"));
	expect(agentPanel(typed)).not.toContain("CLICKED");

	for (let index = 0; index < "CLICKED".length; index++)
		piu.mockInput.pressBackspace();
	await piu.waitForFrame((f) => !inputArea(f).includes("CLICKED"));
	await openContext(piu);
	expect(modalBounds(piu)).toBeDefined();
}, 20000);

test("context scrolls with arrow and paging keys while hints stay fixed", async () => {
	await using piu = await startPiu({
		...fixture({ replies: [] }),
		width: 100,
		height: 20,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const frame = await openContext(piu);
	const text = modalText(piu, frame);
	expect(text).toContain("Model:");
	expect(text).not.toContain("unassigned overhead");
	const hintsRow = (current: string) =>
		current.split("\n").findIndex((line) => line.includes("PgUp PgDn scroll"));
	const fixed = hintsRow(frame);
	expect(fixed).toBeGreaterThan(0);
	for (let index = 0; index < 10; index++) piu.mockInput.pressArrow("down");
	const bottom = await piu.waitForFrame((f) =>
		modalText(piu, f).includes("unassigned overhead"),
	);
	expect(hintsRow(bottom)).toBe(fixed);

	for (let index = 0; index < 10; index++) piu.mockInput.pressArrow("up");
	await piu.waitForFrame((f) => modalText(piu, f).includes("Model:"));

	for (let index = 0; index < 3; index++) piu.mockInput.pressKey("\x1b[57355u");
	const paged = await piu.waitForFrame((f) =>
		modalText(piu, f).includes("unassigned overhead"),
	);
	expect(hintsRow(paged)).toBe(fixed);
	for (let index = 0; index < 3; index++) piu.mockInput.pressKey("\x1b[57354u");
	await piu.waitForFrame((f) => modalText(piu, f).includes("Model:"));

	piu.mockInput.pressKey("END", { ctrl: true });
	const ended = await piu.waitForFrame((f) =>
		modalText(piu, f).includes("unassigned overhead"),
	);
	expect(hintsRow(ended)).toBe(fixed);
	piu.mockInput.pressKey("HOME", { ctrl: true });
	await piu.waitForFrame((f) => modalText(piu, f).includes("Model:"));
	expect(hintsRow(piu.captureCharFrame())).toBe(fixed);
}, 20000);

test("the wheel scrolls context instead of the chat", async () => {
	await using piu = await startPiu({
		...fixture({
			replies: [`Long answer. ${"More of the answer. ".repeat(60)}The end`],
		}),
		width: 100,
		height: 20,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("The end") && !working(frame),
	);
	const before = agentPanel(piu.captureCharFrame());

	await openContext(piu);
	const bounds = modalBounds(piu);
	if (!bounds) throw new Error("The Context Modal is not open.");
	for (let index = 0; index < 6; index++)
		await piu.mockMouse.scroll(bounds.left + 5, bounds.top + 5, "down");
	await piu.waitForFrame((frame) =>
		modalText(piu, frame).includes("unassigned overhead"),
	);

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !modalText(piu, f).includes("Window:"));
	expect(agentPanel(piu.captureCharFrame())).toBe(before);
}, 20000);

type Token = keyof typeof lightTheme;

function spanOn(piu: Piu, row: number, text: string) {
	return piu
		.captureSpans()
		.lines[row]?.spans.find((span) => span.text.includes(text));
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

test("context keeps Swiss colors and resizes with the terminal", async () => {
	await using piu = await startPiu({
		...fixture({ replies: [] }),
		terminalBackground: "light",
		width: 120,
		height: 40,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	const frame = await openContext(piu);
	const bounds = modalBounds(piu);
	if (!bounds) throw new Error("The Context Modal is not open.");
	expect(Math.abs(bounds.width - 90)).toBeLessThanOrEqual(1);
	expect(Math.abs(bounds.height - 30)).toBeLessThanOrEqual(1);
	expect(Math.abs(bounds.left - (120 - bounds.width) / 2)).toBeLessThanOrEqual(
		1,
	);
	expect(Math.abs(bounds.top - (40 - bounds.height) / 2)).toBeLessThanOrEqual(
		1,
	);
	const fillAt = (x: number, y: number) => {
		let column = 0;
		for (const span of piu.captureSpans().lines[y]?.spans ?? []) {
			if (x < column + span.width)
				return span.bg.equals(RGBA.fromHex(lightTheme.surface));
			column += span.width;
		}
		return false;
	};
	expect(fillAt(bounds.left + 2, bounds.top + 2)).toBe(true);
	expect(fillAt(bounds.left + bounds.width - 2, bounds.top + 2)).toBe(true);

	const rows = frame.split("\n");
	const title = rows.findIndex((line) => line.includes(" Context "));
	expect(title).toBeGreaterThan(0);
	expect(rows[title - 1]).toContain(glyphs.heavyRule.repeat(bounds.width - 5));
	expectColors(piu, title - 1, glyphs.heavyRule, {
		fg: "text",
		bg: "surface",
	});
	expectColors(piu, title, "Context", {
		fg: "text",
		bg: "surface",
		bold: true,
	});
	expectColors(piu, title, "esc", { fg: "faint" });
	expectColors(
		piu,
		rows.findIndex((line) => line.includes("estimated")),
		"estimated",
		{
			fg: "faint",
		},
	);
	for (const { label } of CONTEXT_CATEGORIES) {
		const row = rows.findIndex((line) => line.includes(label));
		expectColors(piu, row, label, { fg: "text" });
		const number = spanOn(piu, row, "tokens");
		if (!number) throw new Error(`No token count for ${label}`);
		expect(number.fg.equals(RGBA.fromHex(lightTheme.text))).toBe(true);
		const share = piu
			.captureSpans()
			.lines[row]?.spans.find((span) => /^\s+\d+\.\d%$/.test(span.text));
		if (!share) throw new Error(`No percentage for ${label}`);
		expect(share.fg.equals(RGBA.fromHex(lightTheme.muted))).toBe(true);
		const signal = RGBA.fromHex(lightTheme.signal);
		expect(
			piu
				.captureSpans()
				.lines[row]?.spans.some((span) => span.fg.equals(signal)),
		).toBe(false);
	}

	piu.resize(100, 30);
	const resized = await piu.waitForFrame(
		(frame) =>
			modalBounds(piu)?.width === 75 &&
			modalText(piu, frame).includes("Model:"),
	);
	const after = modalBounds(piu);
	if (!after) throw new Error("The Context Modal is gone after the resize.");
	expect(Math.abs(after.height - 22)).toBeLessThanOrEqual(1);
	expect(Math.abs(after.left + after.width / 2 - 50)).toBeLessThanOrEqual(1);
	expect(Math.abs(after.top + after.height / 2 - 15)).toBeLessThanOrEqual(1);
	expect(modalText(piu, resized)).toContain("Window:");
}, 20000);

test("a malformed context status is neither shown nor opened", async () => {
	await using piu = await startPiu({
		...fixture({
			uiTool: true,
			replies: [
				{
					toolCalls: [
						{
							name: "ui",
							args: {
								method: "setStatus",
								key: "opentui:context/state",
								text: '{"v":1,"open":1,"kind":"ready","snapshot":',
							},
						},
					],
				},
				"After malformed",
			],
		}),
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Go");
	const answered = await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("After malformed") && !working(frame),
	);
	expect(modalBounds(piu)).toBeUndefined();
	expect(answered).not.toContain('"kind":"ready"');

	await piu.mockInput.typeText("TYPING");
	await piu.waitForFrame((f) => inputArea(f).includes("TYPING"));
	for (let index = 0; index < "TYPING".length; index++)
		piu.mockInput.pressBackspace();
	await piu.waitForFrame((f) => !inputArea(f).includes("TYPING"));

	const frame = await openContext(piu);
	expect(readUsage(piu, frame).window).toBeGreaterThan(0);
}, 20000);
