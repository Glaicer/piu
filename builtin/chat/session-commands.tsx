import type { Command, CommandContext } from "../../src/module.ts";
import { openPicker } from "../../src/picker.tsx";
import { currentPromptId, promptRows, type TreeRow } from "./session-tree.ts";
import { listSessions, type SessionSummary } from "./sessions.ts";

async function tree(context: CommandContext) {
	const { tree: nodes, leafId } = await context.actions.sessionTree();
	const rows = promptRows(nodes);
	if (rows.length === 0) return;
	const current = currentPromptId(nodes, leafId);
	openPicker<TreeRow>(context, {
		id: "tree-picker",
		width: 70,
		items: () =>
			rows.map((row) => ({
				label: `${"  ".repeat(row.depth)}${row.text}`.slice(0, 60),
				value: row,
			})),
		selected: () => rows.findIndex((row) => row.entryId === current),
		onPick: (row) => void context.actions.fork(row.entryId),
	});
}

async function resume(context: CommandContext) {
	const sessions = await listSessions(context.pi.sessionFile);
	if (sessions.length === 0) {
		context.actions.showToast("No saved sessions");
		return;
	}
	openPicker<SessionSummary>(context, {
		id: "resume-picker",
		width: 70,
		items: () =>
			sessions.map((session) => ({
				label: session.title.slice(0, 50),
				detail: `${session.messages} messages`,
				value: session,
			})),
		selected: () =>
			sessions.findIndex((session) => session.file === context.pi.sessionFile),
		onPick: (session) => void context.actions.switchSession(session.file),
	});
}

export const sessionCommands: readonly Command[] = [
	{
		name: "new",
		description: "Start a new session",
		takesArguments: false,
		run: ({ actions }) => void actions.newSession(),
	},
	{
		name: "resume",
		description: "Resume another session",
		takesArguments: false,
		run: (context) => void resume(context),
	},
	{
		name: "tree",
		description: "Fork from an earlier prompt",
		takesArguments: false,
		run: (context) => void tree(context),
	},
	{
		name: "compact",
		description: "Compact the context",
		run: ({ actions }, args) => void actions.compact(args.trim() || undefined),
	},
];
