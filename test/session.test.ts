import { expect, test } from "bun:test";
import { join } from "node:path";
import { inputArea, messageBar, panelText, startPiu } from "./harness.ts";

type Piu = Awaited<ReturnType<typeof startPiu>>;

async function send(piu: Piu, text: string) {
	await piu.mockInput.typeText(text);
	piu.mockInput.pressEnter();
}

const agentPanel = (frame: string) => panelText(frame, 10, 0);

test("/new clears the agent Panel, and the next prompt starts a fresh conversation", async () => {
	await using piu = await startPiu({
		script: { replies: ["Seen {messages} {lastUser}"] },
	});
	await send(piu, "hello");
	await piu.waitForFrame((f) => agentPanel(f).includes('Seen 1 "hello"'));

	await send(piu, "/new");
	const cleared = await piu.waitForFrame(
		(f) => !agentPanel(f).includes('Seen 1 "hello"'),
	);
	expect(agentPanel(cleared)).not.toContain("hello");

	await send(piu, "again");
	await piu.waitForFrame((f) => agentPanel(f).includes('Seen 1 "again"'));
});

test("/new keeps the selected model and reasoning for the fresh conversation", async () => {
	await using piu = await startPiu({
		script: { replies: ["Answered by {model} with {reasoning} to {lastUser}"] },
		config: {
			placement: {
				agent: ["chat.messages"],
				status: ["model.current", "reasoning.level"],
			},
		},
	});
	const initial = await piu.waitForFrame((f) => f.includes("faux-1"));
	const model = locate(initial, "faux-1");
	await piu.mockMouse.click(model.x, model.y);
	const picker = await piu.waitForFrame((f) => f.includes("☆ faux-2"));
	const choice = locate(picker, "faux-2");
	await piu.mockMouse.click(choice.x, choice.y);
	piu.mockInput.pressEnter();
	const selected = await piu.waitForFrame(
		(f) =>
			f.includes("faux-2") &&
			f.includes("Reasoning:") &&
			!f.includes("tab search/list"),
	);
	const reasoning = locate(selected, "Reasoning:");
	await piu.mockMouse.click(reasoning.x, reasoning.y);
	const levels = await piu.waitForFrame((f) => f.includes("high"));
	const high = locate(levels, "high");
	await piu.mockMouse.click(high.x, high.y);
	await piu.waitForFrame((f) => f.includes("Reasoning: high"));

	await send(piu, "before");
	await piu.waitForFrame((f) =>
		agentPanel(f).includes('Answered by faux-2 with high to "before"'),
	);
	await send(piu, "/new");
	await piu.waitForFrame(
		(f) => !agentPanel(f).includes('Answered by faux-2 with high to "before"'),
	);
	await send(piu, "after");
	const frame = await piu.waitForFrame((f) =>
		agentPanel(f).includes('to "after"'),
	);
	expect(agentPanel(frame)).toContain(
		'Answered by faux-2 with high to "after"',
	);
});

test("a prompt immediately after /new waits for the selected model and fresh session", async () => {
	await using piu = await startPiu({
		script: { replies: ["Answered by {model} with {messages} messages"] },
		config: {
			placement: {
				agent: ["chat.messages"],
				status: ["model.current"],
			},
		},
	});
	const initial = await piu.waitForFrame((f) => f.includes("faux-1"));
	const model = locate(initial, "faux-1");
	await piu.mockMouse.click(model.x, model.y);
	const picker = await piu.waitForFrame((f) => f.includes("☆ faux-2"));
	const choice = locate(picker, "faux-2");
	await piu.mockMouse.click(choice.x, choice.y);
	piu.mockInput.pressEnter();
	await piu.waitForFrame(
		(f) => f.includes("faux-2") && !f.includes("tab search/list"),
	);

	await send(piu, "/new");
	await send(piu, "after");
	const frame = await piu.waitForFrame((f) =>
		agentPanel(f).includes("Answered by"),
	);
	expect(agentPanel(frame)).toContain("Answered by faux-2 with 1 messages");
});

test("a prompt sent during /new stays visible while the Backend processes it", async () => {
	await using piu = await startPiu({
		script: { replies: ["Reply to {lastUser}"] },
		installedPiExtensions: [
			join(import.meta.dir, "fixtures/pi-extensions/slow-input.ts"),
		],
	});
	await send(piu, "before");
	await piu.waitForFrame((f) => agentPanel(f).includes('Reply to "before"'));
	await send(piu, "/new");
	await send(piu, "after");
	const frame = await piu.waitForFrame(
		(f) => !agentPanel(f).includes('Reply to "before"'),
	);
	expect(agentPanel(frame)).toContain("after  [sending]");
	await piu.waitForFrame((f) => agentPanel(f).includes('Reply to "after"'));
});

test("/compact shrinks the context, shows its service row, and leaves the chat matching Pi's messages", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Answer one", "Answer two", "Summary one", "Summary two"],
		},
	});
	await send(piu, "First");
	await piu.waitForFrame((f) => agentPanel(f).includes("Answer one"));
	await send(piu, "Second");
	await piu.waitForFrame((f) => agentPanel(f).includes("Answer two"));

	await send(piu, "/compact");
	const frame = await piu.waitForFrame(
		(f) =>
			agentPanel(f).includes("Compacted context") &&
			!agentPanel(f).includes("Answer one"),
	);

	const lines = agentPanel(frame).split("\n");
	const row = lines.findIndex((line) => line.includes("Compacted context"));
	expect(lines[row]).toMatch(/Compacted context \(\d+ → ~?\d+ tokens\)/);
	expect(lines.findIndex((line) => line.includes("Answer two"))).toBeLessThan(
		row,
	);
});

function locate(frame: string, text: string) {
	const rows = frame.split("\n");
	const row = rows.findLastIndex((line) => line.includes(text));
	if (row < 0) throw new Error(`"${text}" is not in the frame:\n${frame}`);
	return { x: (rows[row] ?? "").indexOf(text) + 1, y: row };
}

const treeRows = (frame: string) =>
	panelText(frame, 80, 14)
		.split("\n")
		.filter((line) => /^ +(Trunk|Left|Right) prompt/.test(line));

test("/resume lists the saved sessions, and picking one shows its conversation", async () => {
	await using piu = await startPiu({
		script: { replies: ["Reply to {lastUser}"] },
		persistSession: true,
	});
	await send(piu, "Alpha question");
	await piu.waitForFrame((f) => agentPanel(f).includes('Reply to "Alpha'));
	await send(piu, "/new");
	await piu.waitForFrame((f) => !agentPanel(f).includes("Alpha question"));
	await send(piu, "Beta question");
	await piu.waitForFrame((f) => agentPanel(f).includes('Reply to "Beta'));

	await send(piu, "/resume");
	const listed = await piu.waitForFrame(
		(f) => f.includes("Resume session") && f.includes("Alpha question"),
	);
	const rows = listed.split("\n");
	const alpha = rows.find((line) =>
		/Alpha question +Today \d{2}:\d{2}/.test(line),
	);
	const beta = rows.find((line) =>
		/Beta question +current {4,}Today \d{2}:\d{2}/.test(line),
	);
	expect(alpha).toBeDefined();
	expect(beta).toBeDefined();
	expect(alpha?.indexOf("Today")).toBe(beta?.indexOf("Today"));
	expect(listed).not.toContain(" messages");

	await piu.mockInput.typeText("Alpha");
	const filtered = await piu.waitForFrame(
		(f) =>
			f
				.split("\n")
				.some((line) => /Alpha question +Today \d{2}:\d{2}/.test(line)) &&
			!f.split("\n").some((line) => /Beta question +current/.test(line)),
	);

	const { x, y } = locate(filtered, "Alpha question");
	await piu.mockMouse.click(x, y);
	const switched = await piu.waitForFrame(
		(f) =>
			agentPanel(f).includes('Reply to "Alpha') &&
			!agentPanel(f).includes("Beta") &&
			!f.includes(" messages"),
	);
	expect(agentPanel(switched)).toContain(messageBar("Alpha question"));
});

test("/resume keeps one marker column for short and long titles", async () => {
	await using piu = await startPiu({
		width: 79,
		script: { replies: ["Done"] },
		persistSession: true,
	});
	await send(piu, `Long title ${"lots of words ".repeat(9)}`);
	await piu.waitForFrame((f) => agentPanel(f).includes("Done"));
	await send(piu, "/new");
	await piu.waitForFrame((f) => !agentPanel(f).includes("Done"));
	await send(piu, "Short title");
	await piu.waitForFrame((f) => agentPanel(f).includes("Done"));
	await send(piu, "/resume");

	const sessionRows = (frame: string) =>
		frame
			.split("\n")
			.filter((line) => /(?:Short|Long) title.*Today/.test(line));
	const [first, second] = sessionRows(
		await piu.waitForFrame((f) => sessionRows(f).length === 2),
	);
	expect(first).toMatch(/^\s*› Short title/);
	const column = first?.indexOf("Short title") ?? -1;
	expect(second?.indexOf("Long title")).toBe(column);
	expect(second?.slice(column - 2, column)).toBe("  ");

	piu.mockInput.pressArrow("down");
	const [previous, selected] = sessionRows(
		await piu.waitForFrame((f) =>
			sessionRows(f).some((line) => /^\s+Short title/.test(line)),
		),
	);
	expect(previous?.slice(column - 2, column)).toBe("  ");
	expect(selected?.slice(column - 2)).toStartWith("› Long title");

	await piu.mockInput.typeText("Long title");
	const [only] = sessionRows(
		await piu.waitForFrame((f) => sessionRows(f).length === 1),
	);
	expect(only?.slice(column - 2)).toStartWith("› Long title");
});

test("/resume shows the request instead of the expanded skill instructions", async () => {
	await using piu = await startPiu({
		script: { replies: ["Done"] },
		persistSession: true,
	});
	await send(
		piu,
		'<skill name="implement" location="/demo/SKILL.md">\nExpanded instructions\n</skill>\n\nImplement the compact picker',
	);
	await piu.waitForFrame((f) => agentPanel(f).includes("Done"));
	await send(piu, "/resume");
	const frame = await piu.waitForFrame((f) => f.includes("Resume session"));
	expect(frame).toMatch(/Implement the compact picker +current/);
});

test("/tree shows a branched session, and picking an earlier prompt forks from it and puts that prompt back in the input", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Trunk reply", "Left reply", "Right reply"],
			branchBackCommand: true,
		},
		persistSession: true,
	});
	await send(piu, "Trunk prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Trunk reply"));
	await send(piu, "Left prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Left reply"));
	await send(piu, "/branch-back Right prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Right reply"));

	await send(piu, "/tree");
	const open = await piu.waitForFrame((f) => treeRows(f).length === 3);
	const [trunk, left, right] = treeRows(open);
	expect(trunk).toContain("Trunk prompt");
	expect(left).toContain("Left prompt");
	expect(right).toContain("Right prompt");
	expect(left?.indexOf("Left")).toBeGreaterThan(trunk?.indexOf("Trunk") ?? 0);
	expect(right?.indexOf("Right")).toBe(left?.indexOf("Left"));

	const { x, y } = locate(open, "Right prompt");
	await piu.mockMouse.click(x + 20, y);
	const forked = await piu.waitForFrame(
		(f) =>
			!agentPanel(f).includes("Right") &&
			!agentPanel(f).includes("Left") &&
			inputArea(f).includes("Right prompt"),
	);
	expect(agentPanel(forked)).toContain(messageBar("Trunk prompt"));
	expect(agentPanel(forked)).toContain("Trunk reply");
});

test("/tree opens on the prompt of the current position, so Enter forks from it", async () => {
	await using piu = await startPiu({
		script: {
			replies: ["Trunk reply", "Left reply", "Right reply"],
			branchBackCommand: true,
		},
		persistSession: true,
	});
	await send(piu, "Trunk prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Trunk reply"));
	await send(piu, "Left prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Left reply"));
	await send(piu, "/branch-back Right prompt");
	await piu.waitForFrame((f) => agentPanel(f).includes("Right reply"));

	await send(piu, "/tree");
	await piu.waitForFrame((f) => treeRows(f).length === 3);
	piu.mockInput.pressEnter();

	await piu.waitForFrame(
		(f) =>
			!agentPanel(f).includes("Right reply") &&
			inputArea(f).includes("Right prompt"),
	);
});

test("/resume with no saved sessions says so in a Toast", async () => {
	await using piu = await startPiu({ script: { replies: [] } });

	await send(piu, "/resume");

	await piu.waitForFrame((f) => f.includes("No saved sessions"));
});

test("/ autocomplete lists the four session commands", async () => {
	await using piu = await startPiu({ script: { replies: [] } });

	await piu.mockInput.typeText("/");

	// why: the list is drawn from the prompt's text column, so the leftmost cell is whichever Panel border sits under it.
	await piu.waitForFrame((f) =>
		["/new", "/resume", "/tree", "/compact"].every((name) =>
			f.split("\n").some((line) => line.slice(1).startsWith(` ${name} `)),
		),
	);
});
