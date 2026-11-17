import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RGBA, TextAttributes } from "@opentui/core";
import { ManualClock } from "@opentui/core/testing";
import { darkTheme } from "../src/theme.ts";
import {
	modalBounds,
	modalText,
	panelText,
	startPiu,
	working,
} from "./harness.ts";
import { hooks } from "./hooks.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

const agentPanel = (frame: string) => panelText(frame, 10, 0);

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

function modalSpans(piu: Piu) {
	const bounds = modalBounds(piu);
	if (!bounds) return [];
	return piu
		.captureSpans()
		.lines.slice(bounds.top, bounds.top + bounds.height)
		.flatMap((line) => line.spans);
}

test("/btw opens a Modal with the answer and leaves the session, its file and the next request alone", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				"Main reply",
				"Side answer",
				"Seen {messages} after {lastUser}",
			],
		},
		persistSession: true,
	});
	await send(piu, "Hello");
	await piu.waitForFrame(
		(frame) => agentPanel(frame).includes("Main reply") && !working(frame),
	);
	const before = agentPanel(piu.captureCharFrame());

	await send(piu, "/btw What about widgets?");
	const frame = await piu.waitForFrame(
		(f) => f.includes("What about widgets?") && f.includes("Side answer"),
	);
	expect(modalBounds(piu)).toBeDefined();
	expect(frame).toContain("btw · faux-1");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("Side answer"));
	expect(agentPanel(piu.captureCharFrame())).toBe(before);

	await send(piu, "Again");
	await piu.waitForFrame((f) => agentPanel(f).includes('Seen 3 after "Again"'));

	const sessions = join(piu.dir, "agent", "sessions");
	const saved = [...new Bun.Glob("**/*.jsonl").scanSync({ cwd: sessions })]
		.map((name) => readFileSync(join(sessions, name), "utf8"))
		.join("\n");
	expect(saved).toContain("Hello");
	expect(saved).toContain("Again");
	expect(saved).not.toContain("What about widgets?");
	expect(saved).not.toContain("Side answer");
});

test("without a recorded request the side question is built from the session branch", async () => {
	const dir = mkdtempSync(join(tmpdir(), "piu-btw-"));
	try {
		{
			await using resumed = await startPiu({
				dir,
				persistSession: true,
				script: { replies: ["Count {messages}"] },
			});
			await send(resumed, "Hello");
			await resumed.waitForFrame(
				(f) => agentPanel(f).includes("Count 1") && !working(f),
			);
		}
		await using piu = await startPiu({
			dir,
			persistSession: true,
			args: ["--model", "faux/faux-1", "-c"],
			script: { replies: ["Side {messages}"] },
		});
		await piu.waitForFrame((f) => f.includes("Count 1"));

		await send(piu, "/btw after resume");
		await piu.waitForFrame(
			(f) => f.includes("after resume") && f.includes("Side 3"),
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 20_000);

test("the side question keeps the tools of the last main request", async () => {
	await using piu = await startPiu({
		script: { replies: ["Tools {tools}.", "Side tools {tools}."] },
	});
	await send(piu, "Hello");
	const list = (text: string, label: string) =>
		new RegExp(`${label}([\\w,-]+)\\.`).exec(text.replace(/\s+/g, ""))?.[1];
	const main = await piu.waitForFrame((f) =>
		/Tools[\w,-]+\./.test(agentPanel(f).replace(/\s+/g, "")),
	);
	// why: the trailing full stop says the streamed list is complete, and removing whitespace keeps a wrap from breaking a tool name.
	const mainTools = list(agentPanel(main), "Tools");

	await send(piu, "/btw which tools?");
	const side = await piu.waitForFrame((f) =>
		/Sidetools[\w,-]+\./.test(modalText(piu, f).replace(/\s+/g, "")),
	);
	const sideTools = list(modalText(piu, side), "Sidetools");
	expect(sideTools).toBeDefined();
	expect(sideTools).toBe(mainTools);
	expect(sideTools?.split(",")).toContain("bash");
});

test("the side question uses the model of the last main request, not the current one", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Main by {model}", "Side by {model}", "Again by {model}"],
		},
		config: { placement: { status: ["probe.capture"] } },
		extensions: join(import.meta.dir, "fixtures/extensions"),
	});
	await send(piu, "Hello");
	await piu.waitForFrame((f) => agentPanel(f).includes("Main by faux-1"));
	await hooks.probe.actions?.setModel({
		provider: "faux",
		id: "faux-2",
		name: "Faux 2",
	});
	await piu.waitForFrame((f) => f.includes("faux-2"));

	await send(piu, "/btw which model?");
	const frame = await piu.waitForFrame((f) => f.includes("Side by faux-1"));
	expect(frame).toContain("btw · faux-1");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("Side by"));
	await send(piu, "again");
	await piu.waitForFrame((f) => agentPanel(f).includes("Again by faux-2"));
});

test("/btw without a question opens an empty Modal that asks the first question typed there", async () => {
	await using piu = await startPiu({
		script: { replies: ["Main reply", "Side answer"] },
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw");
	const empty = await piu.waitForFrame(
		(f) => f.includes("btw · faux-1") && f.includes("Ask a side question"),
	);
	expect(empty).toContain("⏎ ask");

	await send(piu, "Does it work?");
	await piu.waitForFrame(
		(f) => f.includes("Does it work?") && f.includes("Side answer"),
	);
});

test("/btw while the agent is working opens the Modal and stays out of the answer", async () => {
	const mainAnswer = `Main start. ${"Still streaming the main answer. ".repeat(30)}`;
	await using piu = await startPiu({
		script: {
			replies: [mainAnswer, "Side answer"],
			tokensPerSecond: 300,
			tokenSize: 3,
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((f) => working(f) && f.includes("Main start."));

	await send(piu, "/btw while busy");
	const frame = await piu.waitForFrame(
		(f) => f.includes("while busy") && f.includes("Side answer"),
	);
	expect(modalBounds(piu)).toBeDefined();
	expect(agentPanel(frame)).toContain("Main start.");
});

test("a second question in the same Modal carries the first question and answer in its history", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Main reply", "First {messages}", "Second {messages}"],
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw first question");
	await piu.waitForFrame(
		(f) => f.includes("first question") && f.includes("First 2"),
	);

	await send(piu, "second question");
	const frame = await piu.waitForFrame(
		(f) => f.includes("second question") && f.includes("Second 4"),
	);
	expect(modalText(piu, frame)).toContain("first question");
	expect(modalText(piu, frame)).toContain("First 2");
});

test("an answer with inline code and a code block is drawn in the chat's markdown colours", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				"Main reply",
				"Here is `inline code` and:\n\n```ts\nconst answer: number = 42;\n```",
			],
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw show code");
	await piu.waitForFrame(
		(f) => f.includes("inline code") && f.includes("answer: number"),
	);
	// why: the tree-sitter worker highlights a block asynchronously, so the keyword span appears a frame or two after the text.
	await piu.waitForFrame(() =>
		modalSpans(piu).some(
			(span) =>
				span.text.trim() === "const" &&
				span.fg.equals(RGBA.fromHex(darkTheme.text)) &&
				(span.attributes & TextAttributes.BOLD) !== 0,
		),
	);

	const spans = modalSpans(piu);
	const inline = spans.find((span) => span.text.includes("inline code"));
	expect(inline?.fg.equals(RGBA.fromHex(darkTheme.secondary))).toBe(true);
	expect(inline?.bg.equals(RGBA.fromHex(darkTheme.code))).toBe(true);
});

test("Esc in the middle of a slow answer stops it and keeps the Modal open, and a second Esc closes it", async () => {
	const answer = `Start of the side answer. ${"More text that keeps going. ".repeat(40)}`;
	await using piu = await startPiu({
		script: {
			replies: ["Main reply", answer],
			tokensPerSecond: 40,
			tokenSize: 3,
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw tell me slowly");
	await piu.waitForFrame((f) => f.includes("Start of the side answer"));
	await piu.waitForFrame((f) => f.includes("esc stop"));
	piu.mockInput.pressEscape();

	const stopped = await piu.waitForFrame((f) => f.includes("Stopped."));
	expect(modalBounds(piu)).toBeDefined();
	expect(stopped).toContain("esc close");

	piu.mockInput.pressEscape();
	await piu.waitForFrame((f) => !f.includes("Stopped."));
	expect(modalBounds(piu)).toBeUndefined();
});

test("closing the Modal during an answer interrupts it and forgets the side thread", async () => {
	const answer = `Start of the side answer. ${"More text that keeps going. ".repeat(40)}`;
	await using piu = await startPiu({
		script: {
			replies: ["Main reply", answer, "Count {messages}"],
			tokensPerSecond: 40,
			tokenSize: 3,
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw tell me slowly");
	await piu.waitForFrame((f) => f.includes("Start of the side answer"));
	await piu.waitForFrame((f) => f.includes("esc stop"));
	await piu.mockMouse.click(2, 2);
	await piu.waitForFrame((f) => !f.includes("Start of the side answer"));
	expect(modalBounds(piu)).toBeUndefined();

	// why: no frame shows Pi ending the side thread after the app cancels its next dialog, so the question is retried until a new Modal opens.
	let frame: string | undefined;
	for (let attempt = 0; attempt < 20 && frame === undefined; attempt++) {
		if (!modalBounds(piu)) await send(piu, "/btw second question");
		frame = await piu
			.waitForFrame(
				(f) => f.includes("second question") && f.includes("Count"),
				250,
			)
			.catch(() => undefined);
	}
	expect(frame).toBeDefined();
	if (frame === undefined) return;
	expect(modalText(piu, frame)).toContain("Count 2");
	expect(modalText(piu, frame)).not.toContain("Start of the side answer");
});

test("without a usable model the Modal shows an error instead of staying empty", async () => {
	await using piu = await startPiu({
		script: { noModels: true, replies: [] },
		args: [],
	});
	await send(piu, "/btw hello");
	await piu.waitForFrame(
		(f) => f.includes("btw · unknown") && f.includes("> hello"),
	);
	expect(modalBounds(piu)).toBeDefined();
	const failure = modalSpans(piu).find(
		(span) =>
			span.text.trim().length > 3 &&
			span.fg.equals(RGBA.fromHex(darkTheme.error)),
	);
	expect(failure?.text).toContain("provider");
	expect(modalText(piu, piu.captureCharFrame())).not.toContain(
		"Ask a side question",
	);
});

test("a provider error is shown in the Modal", async () => {
	await using piu = await startPiu({
		script: { replies: ["Main reply", { error: "400 invalid request" }] },
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw break it");
	await piu.waitForFrame((f) => f.includes("400 invalid request"));
	expect(modalBounds(piu)).toBeDefined();
});

test("a new session forgets the side thread", async () => {
	await using piu = await startPiu({
		script: { replies: ["Count {messages}", "More {messages}"] },
		config: { placement: { status: ["probe.capture"] } },
		extensions: join(import.meta.dir, "fixtures/extensions"),
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Count 1"));

	await send(piu, "/btw first question");
	await piu.waitForFrame(
		(f) => f.includes("first question") && f.includes("More 2"),
	);

	await hooks.probe.actions?.newSession();
	await piu.waitForFrame((f) => !f.includes("first question"));

	await send(piu, "/btw second question");
	const frame = await piu.waitForFrame(
		(f) => f.includes("second question") && f.includes("Count"),
	);
	expect(modalText(piu, frame)).toContain("Count 1");
	expect(modalText(piu, frame)).not.toContain("first question");
});

test("a compaction forgets the side thread", async () => {
	await using piu = await startPiu({
		script: { replies: ["Main reply", "Side answer", "The summary"] },
		config: { placement: { status: ["probe.capture"] } },
		extensions: join(import.meta.dir, "fixtures/extensions"),
	});
	await send(piu, "Hello");
	await piu.waitForFrame((f) => agentPanel(f).includes("Main reply"));

	await send(piu, "/btw side question");
	await piu.waitForFrame((f) => f.includes("Side answer"));

	await hooks.probe.actions?.compact();
	await piu.waitForFrame((f) => !f.includes("Side answer"), 10_000);
	expect(modalBounds(piu)).toBeUndefined();
}, 20_000);

test("navigating the session tree forgets the side thread", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["First reply", "Second reply", "Side answer", "Third reply"],
			branchBackCommand: true,
		},
		config: { placement: { status: ["probe.capture"] } },
		extensions: join(import.meta.dir, "fixtures/extensions"),
	});
	await send(piu, "First prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("First reply"));
	await send(piu, "Second prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Second reply"));

	await send(piu, "/btw side question");
	await piu.waitForFrame((f) => f.includes("Side answer"));

	await hooks.probe.actions?.prompt("/branch-back Third prompt");
	await piu.waitForFrame(
		(f) => agentPanel(f).includes("Third reply") && !f.includes("Side answer"),
		10_000,
	);
	expect(modalBounds(piu)).toBeUndefined();
}, 20_000);

test("the Modal scrolls with the arrow and paging keys and holds new output at the end only while it is at the end", async () => {
	const lines = Array.from(
		{ length: 80 },
		(_, index) => `Line ${String(index).padStart(3, "0")}`,
	).join("\n\n");
	await using piu = await startPiu({
		script: {
			replies: ["Main reply", lines],
			tokensPerSecond: 100,
			tokenSize: 3,
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw many lines");
	// why: the Modal is at the end and has never been scrolled, so later lines only arrive in view if it follows the output.
	await piu.waitForFrame((f) => modalText(piu, f).includes("Line 040"));
	await piu.waitForFrame((f) => f.includes("esc stop"));

	for (let step = 0; step < 16; step++) piu.mockInput.pressArrow("up");
	const away = await piu.waitForFrame(
		(f) => !modalText(piu, f).includes("Line 079"),
	);
	const firstShown = /Line \d{3}/.exec(modalText(piu, away))?.[0];
	expect(firstShown).toBeDefined();

	// why: the frame the stream ends on is mid-reflow, so wait for the transcript to draw at its held position again.
	const finished = await piu.waitForFrame(
		(f) =>
			f.includes("esc close") && modalText(piu, f).includes(firstShown ?? ""),
		10_000,
	);
	expect(modalText(piu, finished)).not.toContain("Line 079");

	piu.mockInput.pressKey("END", { ctrl: true });
	await piu.waitForFrame((f) => modalText(piu, f).includes("Line 079"));

	for (let step = 0; step < 4; step++) piu.mockInput.pressKey("\u001b[5~");
	const up = await piu.waitForFrame(
		(f) => !modalText(piu, f).includes("Line 079"),
	);
	const beforeDown = /Line \d{3}/.exec(modalText(piu, up))?.[0];

	piu.mockInput.pressArrow("down");
	await piu.waitForFrame(
		(f) => /Line \d{3}/.exec(modalText(piu, f))?.[0] !== beforeDown,
	);

	for (let step = 0; step < 4; step++) piu.mockInput.pressKey("\u001b[6~");
	await piu.waitForFrame((f) => modalText(piu, f).includes("Line 079"));
}, 20_000);

test("the reasoning of a side answer is a Thinking block that opens on a click", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				"Main reply",
				{ thinking: "Weighing the widget options", text: "Side answer" },
			],
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw think first");
	const closed = await piu.waitForFrame(
		(f) => f.includes("Side answer") && f.includes("▸ Thinking"),
	);
	expect(modalText(piu, closed)).not.toContain("Weighing the widget options");
	expect(modalText(piu, closed).indexOf("Thinking")).toBeLessThan(
		modalText(piu, closed).indexOf("Side answer"),
	);

	const rows = closed.split("\n");
	const y = rows.findIndex((line) => line.includes("▸ Thinking"));
	await piu.mockMouse.click((rows[y] ?? "").indexOf("▸ Thinking") + 1, y);
	await piu.waitForFrame((f) =>
		modalText(piu, f).includes("Weighing the widget options"),
	);
});

test("reasoning that arrives before the answer text is shown while the answer streams", async () => {
	await using piu = await startPiu({
		script: {
			replies: [
				"Main reply",
				{ thinking: "Weighing the widget options", text: "Side answer" },
			],
			tokensPerSecond: 20,
			tokenSize: 3,
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw think first");
	await piu.waitForFrame(
		(f) => f.includes("esc stop") && f.includes("Thinking"),
	);
});

test("while answering, the placeholder dots change every half second", async () => {
	const answer = `Start of the side answer. ${"More text that keeps going. ".repeat(60)}`;
	const clock = new ManualClock();
	await using piu = await startPiu({
		clock,
		config: { animations: true },
		script: {
			replies: ["Main reply", answer],
			tokensPerSecond: 40,
			tokenSize: 3,
		},
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw tell me slowly");
	await piu.waitForFrame((f) => f.includes("answering"));
	const dots = async (ms: number) => {
		clock.advance(ms);
		await piu.renderOnce();
		return /answering(\.+|…)/.exec(piu.captureCharFrame())?.[1];
	};
	// why: the loop starts at an unknown phase of the manual clock, so the first sample only warms it up.
	await dots(510);
	const seen: (string | undefined)[] = [];
	for (let step = 0; step < 6; step++) seen.push(await dots(510));
	const counts = seen.map((value) => value?.length);
	for (let at = 1; at < counts.length; at++)
		expect(counts[at]).toBe(((counts[at - 1] ?? 0) % 3) + 1);
	expect(new Set(counts)).toEqual(new Set([1, 2, 3]));
});

test("the key hints sit in the bottom right corner of the Modal", async () => {
	await using piu = await startPiu({
		script: { replies: ["Main reply", "Side answer"] },
	});
	await send(piu, "Hello");
	await piu.waitForFrame((frame) => agentPanel(frame).includes("Main reply"));

	await send(piu, "/btw hints");
	const frame = await piu.waitForFrame((f) => f.includes("Side answer"));
	const bounds = modalBounds(piu);
	const row = frame.split("\n").find((line) => line.includes("⏎ ask"));
	expect(bounds).toBeDefined();
	expect(row).toBeDefined();
	if (!bounds || !row) return;
	const start = row.indexOf("⏎ ask");
	const end = row.indexOf("esc close") + "esc close".length;
	expect(start).toBeGreaterThan(bounds.left + bounds.width / 2);
	expect(bounds.left + bounds.width - end).toBeLessThanOrEqual(3);
});
