import { expect, test } from "bun:test";
import { inputArea, panelText, startPiu } from "./harness.ts";

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
	const listed = await piu.waitForFrame((f) => f.includes("Alpha question"));
	expect(listed).toContain("Beta question");

	const { x, y } = locate(listed, "Alpha question");
	await piu.mockMouse.click(x, y);
	const switched = await piu.waitForFrame(
		(f) =>
			agentPanel(f).includes('Reply to "Alpha') &&
			!agentPanel(f).includes("Beta") &&
			!f.includes(" messages"),
	);
	expect(agentPanel(switched)).toContain("> Alpha question");
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
	expect(agentPanel(forked)).toContain("> Trunk prompt");
	expect(agentPanel(forked)).toContain("Trunk reply");
});

test("/resume with no saved sessions says so in a Toast", async () => {
	await using piu = await startPiu({ script: { replies: [] } });

	await send(piu, "/resume");

	await piu.waitForFrame((f) => f.includes("No saved sessions"));
});

test("/ autocomplete lists the four session commands", async () => {
	await using piu = await startPiu({ script: { replies: [] } });

	await piu.mockInput.typeText("/");

	await piu.waitForFrame((f) =>
		["/new", "/resume", "/tree", "/compact"].every((name) =>
			f.split("\n").some((line) => line.startsWith(`│ ${name} `)),
		),
	);
});
