import type { SessionTreeNode } from "@earendil-works/pi-coding-agent";
import { contentText, oneLine } from "./sessions.ts";

export type TreeRow = {
	readonly entryId: string;
	readonly text: string;
	readonly depth: number;
};

type Prompt = {
	readonly entryId: string;
	readonly text: string;
	readonly children: readonly Prompt[];
};

function prompts(nodes: readonly SessionTreeNode[]): Prompt[] {
	return nodes.flatMap((node) => {
		const { entry } = node;
		const below = prompts(node.children);
		if (entry.type !== "message" || entry.message.role !== "user") return below;
		return [
			{
				entryId: entry.id,
				text: oneLine(contentText(entry.message.content)),
				children: below,
			},
		];
	});
}

function flatten(siblings: readonly Prompt[], depth: number): TreeRow[] {
	return siblings.flatMap((prompt) => [
		{ entryId: prompt.entryId, text: prompt.text, depth },
		...flatten(prompt.children, depth + (prompt.children.length > 1 ? 1 : 0)),
	]);
}

// why: Pi's `fork` accepts only user prompts, so the tree lists those and indents only where the conversation branches.
export function promptRows(tree: readonly SessionTreeNode[]): TreeRow[] {
	return flatten(prompts(tree), 0);
}

function pathTo(
	nodes: readonly SessionTreeNode[],
	leafId: string,
): SessionTreeNode[] | undefined {
	for (const node of nodes) {
		if (node.entry.id === leafId) return [node];
		const below = pathTo(node.children, leafId);
		if (below) return [node, ...below];
	}
}

// why: the leaf is usually an assistant reply, which the list leaves out, so the current position is the last prompt on the way down to it.
export function currentPromptId(
	tree: readonly SessionTreeNode[],
	leafId: string | null,
): string | undefined {
	const path = leafId === null ? undefined : pathTo(tree, leafId);
	return path?.findLast(
		({ entry }) => entry.type === "message" && entry.message.role === "user",
	)?.entry.id;
}
