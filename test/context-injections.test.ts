import { expect, test } from "bun:test";
import { join } from "node:path";
import { RGBA } from "@opentui/core";
import { formatTokens } from "../src/context-usage.ts";
import { modalContentInsets } from "../src/layout.tsx";
import { darkTheme } from "../src/theme.ts";
import {
	type FauxScript,
	inputArea,
	modalBounds,
	modalText,
	panelText,
	startPiu,
	working,
} from "./harness.ts";
import { hooks } from "./hooks.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const agentPanel = (frame: string) => panelText(frame, 10, 0);
const extensions = join(import.meta.dir, "fixtures/extensions");
const piExtensions = join(import.meta.dir, "fixtures/pi-extensions");

function fixture(script: FauxScript, backendEnv: Record<string, string> = {}) {
	return {
		script,
		installedPiExtensions: [join(piExtensions, "context-usage.ts")],
		extensions,
		config: { placement: { status: ["probe.capture"] } },
		backendEnv,
		width: 160,
		height: 50,
	};
}

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

async function openInjections(piu: Piu): Promise<string> {
	await send(piu, "/context injections");
	return piu.waitForFrame(
		(frame) =>
			modalText(piu, frame).includes("System prompt · ") ||
			modalText(piu, frame).includes("No request to the model yet."),
		8000,
	);
}

type Row = {
	readonly name: string;
	readonly origin: string;
	readonly requestOnly: string;
	readonly tokens: string;
};

const GROUPS = ["System prompt", "Tools", "Messages"] as const;

function rowsOf(piu: Piu, frame: string): Record<string, Row[]> {
	const groups: Record<string, Row[]> = {
		"System prompt": [],
		Tools: [],
		Messages: [],
	};
	let current: string | undefined;
	for (const raw of modalText(piu, frame).split("\n")) {
		const line = raw.trimEnd();
		const header = /^(System prompt|Tools|Messages) · (\d+)$/.exec(line);
		if (header) {
			current = header[1] ?? "";
			continue;
		}
		if (!current || !line.startsWith(" ")) {
			current = undefined;
			continue;
		}
		const fields = line.trim().split(/\s{2,}/);
		groups[current]?.push({
			name: fields[0] ?? "",
			origin: fields[1] ?? "",
			requestOnly:
				fields.length > 3
					? (fields[2] ?? "").replace(/^request only · /, "")
					: "",
			tokens: (fields.at(-1) ?? "").replace(/ tokens$/, ""),
		});
	}
	return groups;
}

function itemRows(piu: Piu, frame: string): Row[] {
	const groups = rowsOf(piu, frame);
	return GROUPS.flatMap((group) => groups[group] ?? []);
}

// why: both tab names share one screen row, so its index is the bar's position without reading layout.
const tabRow = (frame: string) =>
	frame.split("\n").findIndex((line) => line.includes("Usage   Injections"));

// why: the chosen row is the only one filled with the bar colour inside the Modal, so a test can read the selection instead of guessing how many Downs moved it.
function selectedName(piu: Piu): string | undefined {
	const bounds = modalBounds(piu);
	if (!bounds) return undefined;
	const bar = RGBA.fromHex(darkTheme.bar);
	const rows = piu
		.captureSpans()
		.lines.slice(
			bounds.top + modalContentInsets.top,
			bounds.top + bounds.height - modalContentInsets.bottom,
		);
	const at = rows.findIndex((line) =>
		line.spans.some((span) => span.bg.equals(bar)),
	);
	if (at < 0) return undefined;
	const line = (modalText(piu, piu.captureCharFrame()).split("\n")[at] ?? "")
		.trimEnd()
		.trim();
	if (/^(System prompt|Tools|Messages) · /.test(line)) return undefined;
	return line.split(/\s{2,}/)[0];
}

async function pressDownTo(piu: Piu, name: string): Promise<void> {
	for (let step = 0; step < 40; step++) {
		if (selectedName(piu) === name) return;
		piu.mockInput.pressArrow("down");
		await piu.renderOnce();
	}
	throw new Error(`Never reached the ${name} row.`);
}

test("injections before the first request say there was none", async () => {
	await using piu = await startPiu(fixture({ replies: [] }));
	await piu.waitForFrame((frame) => frame.includes("faux-1"));

	const frame = await openInjections(piu);
	expect(modalBounds(piu)).toBeDefined();
	expect(modalText(piu, frame)).toContain("No request to the model yet.");
	expect(modalText(piu, frame)).not.toContain("Window:");
}, 20000);

test("a section added in before_agent_start is listed with its size", async () => {
	const body = "PROBE_SECTION_BODY ".repeat(20).trim();
	await using piu = await startPiu(
		fixture({ replies: ["Answer"] }, { PIU_CONTEXT_SECTION: body }),
	);
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);

	const frame = await openInjections(piu);
	const system = rowsOf(piu, frame)["System prompt"] ?? [];
	const probe = system.find((row) => row.name === "probe_notes");
	if (!probe) throw new Error(`No probe_notes row:\n${modalText(piu, frame)}`);
	expect(probe.origin).toBe("Pi extension");
	expect(probe.tokens).toBe(
		formatTokens(
			Math.ceil(`<probe_notes>\n${body}\n</probe_notes>`.length / 4),
		),
	);
	const preamble = system.find((row) => row.name === "preamble");
	expect(preamble?.origin).toBe("Pi");
	for (const row of system) expect(row.requestOnly).toBe("");
}, 20000);

test("Enter opens an injection's full text and Escape returns to the list", async () => {
	const body = "PROBE_SECTION_BODY ".repeat(20).trim();
	await using piu = await startPiu(
		fixture({ replies: ["Answer"] }, { PIU_CONTEXT_SECTION: body }),
	);
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);
	await openInjections(piu);
	await pressDownTo(piu, "probe_notes");

	piu.mockInput.pressEnter();
	const detail = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("PROBE_SECTION_BODY"),
		8000,
	);
	expect(modalText(piu, detail)).toContain("esc back");
	expect(modalText(piu, detail)).not.toContain("System prompt · ");

	piu.mockInput.pressEscape();
	const list = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("System prompt · "),
		8000,
	);
	expect(modalBounds(piu)).toBeDefined();
	expect(modalText(piu, list)).not.toContain("esc back");

	piu.mockInput.pressEscape();
	await piu.waitForFrame(() => modalBounds(piu) === undefined, 8000);
	await piu.mockInput.typeText("MARKER");
	await piu.waitForFrame((frame) => inputArea(frame).includes("MARKER"));
}, 20000);

test("a click opens an injection's full text", async () => {
	const body = "PROBE_SECTION_BODY ".repeat(20).trim();
	await using piu = await startPiu(
		fixture({ replies: ["Answer"] }, { PIU_CONTEXT_SECTION: body }),
	);
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);

	const frame = await openInjections(piu);
	const lines = frame.split("\n");
	const row = lines.findIndex((line) => line.includes("probe_notes"));
	const column = (lines[row] ?? "").indexOf("probe_notes");
	expect(row).toBeGreaterThan(0);
	expect(column).toBeGreaterThan(0);
	await piu.mockMouse.click(column + 1, row);
	const detail = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("PROBE_SECTION_BODY"),
		8000,
	);
	expect(modalText(piu, detail)).toContain("esc back");
}, 20000);

test("the listed tools are the tools the faux model received", async () => {
	await using piu = await startPiu(fixture({ replies: ["Tools: {tools}"] }));
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	const answered = await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Tools: ") && !working(frame),
	);
	const listed =
		/Tools: ([^\n]*)/.exec(agentPanel(answered))?.[1]?.trim() ?? "";

	const frame = await openInjections(piu);
	const tools = rowsOf(piu, frame).Tools ?? [];
	expect(
		tools
			.map((row) => row.name)
			.sort()
			.join(","),
	).toBe(listed);
	const origins = new Map(tools.map((row) => [row.name, row.origin]));
	for (const row of tools) expect(row.origin.length).toBeGreaterThan(0);
	expect(origins.get("bash")).toBe("Pi");
	expect(origins.get("read")).toBe("Pi");
	// why: piu runs its own Pi extensions through `-e`, so their tools are named after the extension folder, not Pi.
	expect(origins.get("ask_user")).toBe("ask-user-question");
}, 20000);

test("a message an extension adds is listed as saved", async () => {
	await using piu = await startPiu(
		fixture(
			{ replies: ["Answer"] },
			{ PIU_CONTEXT_MESSAGE: "PROBE_NOTE_TEXT" },
		),
	);
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);

	const frame = await openInjections(piu);
	const messages = rowsOf(piu, frame).Messages ?? [];
	const note = messages.find((row) => row.name === "probe-note");
	if (!note) {
		throw new Error(`No probe-note row:\n${modalText(piu, frame)}`);
	}
	expect(note.origin).toBe("Pi extension");
	expect(note.requestOnly).toBe("");

	await pressDownTo(piu, "probe-note");
	piu.mockInput.pressEnter();
	const detail = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("PROBE_NOTE_TEXT"),
		8000,
	);
	expect(modalText(piu, detail)).toContain("esc back");
}, 20000);

test("a message edited only in the request is marked", async () => {
	await using piu = await startPiu(
		fixture({ replies: ["Answer"] }, { PIU_CONTEXT_TRANSIENT: "1" }),
	);
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Original prompt");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);

	const frame = await openInjections(piu);
	const messages = rowsOf(piu, frame).Messages ?? [];
	const changed = messages.find((row) => row.name === "user");
	if (!changed) {
		throw new Error(`No changed user row:\n${modalText(piu, frame)}`);
	}
	expect(changed.requestOnly).toBe("changed");
	for (const row of itemRows(piu, frame)) {
		if (row.name !== "user") expect(row.requestOnly).toBe("");
	}

	await pressDownTo(piu, "user");
	piu.mockInput.pressEnter();
	const detail = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("REQUEST_ONLY_"),
		8000,
	);
	expect(modalText(piu, detail)).toContain("request only · changed");
}, 20000);

test("a forced system prompt is marked and replaces the sections", async () => {
	await using piu = await startPiu(
		fixture(
			{ replies: ["Answer"] },
			{ PIU_CONTEXT_FORCED: "FORCED_PROMPT_MARK" },
		),
	);
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);

	const frame = await openInjections(piu);
	const system = rowsOf(piu, frame)["System prompt"] ?? [];
	expect(system).toHaveLength(1);
	const row = system[0];
	expect(row?.name).toBe("system prompt");
	expect(row?.requestOnly).toBe("forced");

	await pressDownTo(piu, "system prompt");
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("request only · forced"),
		8000,
	);
	piu.mockInput.pressKey("END", { ctrl: true });
	const detail = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("FORCED_PROMPT_MARK"),
		8000,
	);
	expect(modalText(piu, detail)).toContain("esc back");
}, 20000);

test("arrow keys switch between usage and injections in one Modal", async () => {
	await using piu = await startPiu(fixture({ replies: [] }));
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "/context");
	await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("Window:"),
		8000,
	);
	const bounds = modalBounds(piu);

	piu.mockInput.pressArrow("right");
	const injections = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("No request to the model yet."),
		8000,
	);
	expect(modalText(piu, injections)).not.toContain("Window:");
	expect(modalBounds(piu)).toEqual(bounds);

	piu.mockInput.pressArrow("left");
	await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("Window:"),
		8000,
	);
	expect(modalBounds(piu)).toEqual(bounds);
}, 20000);

test("a click on a tab switches the view", async () => {
	await using piu = await startPiu(fixture({ replies: [] }));
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "/context");
	await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("Window:"),
		8000,
	);
	const first = piu.captureCharFrame();
	const firstRow = tabRow(first);
	const injectionsAt = (first.split("\n")[firstRow] ?? "").indexOf(
		"Injections",
	);
	expect(firstRow).toBeGreaterThan(0);
	await piu.mockMouse.click(injectionsAt + 1, firstRow);
	const list = await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("No request to the model yet."),
		8000,
	);

	const secondRow = tabRow(list);
	const usageAt = (list.split("\n")[secondRow] ?? "").indexOf("Usage");
	await piu.mockMouse.click(usageAt + 1, secondRow);
	await piu.waitForFrame(
		(frame) => modalText(piu, frame).includes("Window:"),
		8000,
	);
}, 20000);

test("the tab bar stays while the list scrolls", async () => {
	const body = "PROBE_SECTION_BODY ".repeat(20).trim();
	await using piu = await startPiu({
		...fixture({ replies: ["Answer"] }, { PIU_CONTEXT_SECTION: body }),
		width: 100,
		height: 20,
	});
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);
	await openInjections(piu);
	const before = tabRow(piu.captureCharFrame());
	expect(before).toBeGreaterThan(0);

	for (let index = 0; index < 15; index++) piu.mockInput.pressArrow("down");
	const scrolled = await piu.waitForFrame(
		(frame) => !modalText(piu, frame).includes("preamble"),
		8000,
	);
	expect(tabRow(scrolled)).toBe(before);
}, 20000);

test("a new session forgets the last request's injections", async () => {
	const body = "PROBE_SECTION_BODY ".repeat(20).trim();
	await using piu = await startPiu(
		fixture({ replies: ["Answer"] }, { PIU_CONTEXT_SECTION: body }),
	);
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Answer") && !working(frame),
	);

	const frame = await openInjections(piu);
	const before = rowsOf(piu, frame)["System prompt"] ?? [];
	expect(before.some((row) => row.name === "preamble")).toBe(true);

	const actions = hooks.probe.actions;
	if (!actions) throw new Error("The probe Extension is not placed.");
	await actions.newSession();
	await piu.waitForFrame(() => modalBounds(piu) === undefined, 8000);

	const fresh = await openInjections(piu);
	expect(modalText(piu, fresh)).toContain("No request to the model yet.");
	const after = rowsOf(piu, fresh)["System prompt"] ?? [];
	expect(after.some((row) => row.name === "preamble")).toBe(false);
}, 20000);

test("an unknown context view shows an error and opens nothing", async () => {
	await using piu = await startPiu(fixture({ replies: [] }));
	await piu.waitForFrame((frame) => frame.includes("faux-1"));

	await send(piu, "/context foo");
	await piu.waitForFrame(
		(frame) => frame.includes('Unknown /context view "foo"'),
		8000,
	);
	expect(modalBounds(piu)).toBeUndefined();
	await piu.mockInput.typeText("TYPING");
	const typed = await piu.waitForFrame(
		(frame) =>
			inputArea(frame).includes("TYPING") &&
			frame.includes('Unknown /context view "foo"'),
	);
	expect(typed).toContain("TYPING");
}, 20000);

test("a malformed injections status is neither shown nor kept", async () => {
	await using piu = await startPiu(
		fixture({
			uiTool: true,
			replies: [
				{
					toolCalls: [
						{
							name: "ui",
							args: {
								method: "setStatus",
								key: "opentui:context/injections",
								text: '{"v":1,"items":[',
							},
						},
					],
				},
				"After malformed",
			],
		}),
	);
	await piu.waitForFrame((frame) => frame.includes("faux-1"));
	await send(piu, "Go");
	const answered = await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("After malformed") && !working(frame),
	);
	expect(modalBounds(piu)).toBeUndefined();
	expect(answered).not.toContain('"items":[');

	const frame = await openInjections(piu);
	const system = rowsOf(piu, frame)["System prompt"] ?? [];
	expect(system.some((row) => row.name === "preamble")).toBe(true);
}, 20000);
