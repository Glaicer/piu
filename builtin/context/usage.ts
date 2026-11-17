import {
	contentText,
	getCurrentSystemMessage,
	getCurrentTools,
	getSystemMessageText,
	type Message,
	type SystemMessage,
	toToolDeclaration,
} from "@earendil-works/pi-ai";
import { estimateTokens } from "@earendil-works/pi-coding-agent";
import {
	CONTEXT_CATEGORIES,
	type ContextBreakdown,
	type ContextCategory,
} from "../../src/context-usage.ts";

const SKILLS = "skills";
const SKILLS_BLOCK = /<skills>[\s\S]*?<\/skills>/g;

const NAMED = CONTEXT_CATEGORIES.map(({ id }) => id).filter(
	(id): id is Exclude<ContextCategory, "other"> => id !== "other",
);

function takeSkillBlocks(text: string) {
	let chars = 0;
	const rest = text.replace(SKILLS_BLOCK, (block) => {
		chars += block.length;
		return "";
	});
	return { rest, chars };
}

// why: Pi renders the whole skill catalogue into the system prompt, so counting it as the system prompt would hide the one part a session can switch off; the catalogue left in an opaque forced prompt is cut out of the text the same way.
export function estimateContext(
	messages: readonly Message[],
): ContextBreakdown {
	const current = getCurrentSystemMessage(messages);
	let skillsChars = 0;
	let systemChars = 0;
	if (current) {
		const sections: Record<string, string | null> = { ...current.sections };
		const catalogue = sections[SKILLS];
		if (typeof catalogue === "string") {
			skillsChars += catalogue.length;
			delete sections[SKILLS];
		}
		for (const [name, value] of Object.entries(sections)) {
			if (value === null) continue;
			const { rest, chars } = takeSkillBlocks(value);
			skillsChars += chars;
			sections[name] = rest;
		}
		const content = takeSkillBlocks(contentText(current.content));
		skillsChars += content.chars;
		const copy: SystemMessage = {
			...current,
			content: content.rest,
			sections,
		};
		systemChars = getSystemMessageText(copy).length;
	}
	const tools = getCurrentTools(messages);
	const toolsChars = tools.length
		? JSON.stringify(tools.map(toToolDeclaration)).length
		: 0;
	let messagesTokens = 0;
	for (const message of messages) {
		if (message.role !== "system") messagesTokens += estimateTokens(message);
	}
	return {
		system: Math.ceil(systemChars / 4),
		tools: Math.ceil(toolsChars / 4),
		skills: Math.ceil(skillsChars / 4),
		messages: messagesTokens,
		other: 0,
	};
}

// why: Pi reports the last request's own token count, which no local estimate can reproduce exactly, so the estimated categories are scaled to it and the rounding remainder lands in `other` rather than being dropped.
export function alignContextBreakdown(
	weights: ContextBreakdown,
	used: number,
): ContextBreakdown {
	const named = NAMED.map((id) => weights[id]);
	const sum = named.reduce((total, value) => total + value, 0);
	if (sum === 0) {
		return { system: 0, tools: 0, skills: 0, messages: 0, other: used };
	}
	if (sum <= used) return { ...weights, other: used - sum };
	const exact = named.map((value) => (value * used) / sum);
	const floors = exact.map(Math.floor);
	let rest = used - floors.reduce((total, value) => total + value, 0);
	const order = exact
		.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
		.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
	for (const { index } of order) {
		if (rest <= 0) break;
		floors[index] = (floors[index] ?? 0) + 1;
		rest -= 1;
	}
	const aligned: Record<ContextCategory, number> = {
		system: 0,
		tools: 0,
		skills: 0,
		messages: 0,
		other: 0,
	};
	for (const [index, id] of NAMED.entries()) aligned[id] = floors[index] ?? 0;
	return aligned;
}
