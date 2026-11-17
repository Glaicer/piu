import { basename, dirname, extname } from "node:path";
import {
	contentText,
	getCurrentSystemMessage,
	getCurrentTools,
	getSystemMessageText,
	toToolDeclaration,
} from "@earendil-works/pi-ai";
import {
	type ContextWithSystemEvent,
	convertToLlm,
	estimateTokens,
	type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import {
	type ContextInjection,
	charsToTokens,
} from "../../src/context-usage.ts";

type RequestMessage = ContextWithSystemEvent["messages"][number];

export type InjectionsInput = {
	readonly request: readonly RequestMessage[];
	readonly session: readonly RequestMessage[];
	readonly effectivePrompt: string;
	readonly hiddenTools: readonly string[];
	readonly tools: readonly ToolInfo[];
};

// why: copied from `buildSystemPromptSections` in Pi 1.5.0 (`dist/core/system-prompt.js`); reread it when Pi is upgraded.
const PI_SECTIONS = [
	"preamble",
	"tools",
	"rules",
	"docs",
	"addendum",
	"project_context",
	"skills",
	"cwd",
];

export function collectInjections(input: InjectionsInput): ContextInjection[] {
	const request = convertToLlm([...input.request]);
	const session = convertToLlm([...input.session]);
	const sent = getCurrentSystemMessage(request);
	const saved = getCurrentSystemMessage(session);
	// why: Pi projects a `before_agent_start` prompt onto the request after this hook, so the only sign of one is the prompt Pi reports for the run.
	const forced =
		saved !== undefined &&
		input.effectivePrompt !== getSystemMessageText(saved);
	const items: ContextInjection[] = [];
	if (forced) {
		items.push({
			group: "system",
			name: "system prompt",
			origin: "extension",
			tokens: charsToTokens(input.effectivePrompt.length),
			text: input.effectivePrompt,
			requestOnly: "forced",
		});
	} else if (sent) {
		const content = contentText(sent.content);
		if (content)
			items.push({
				group: "system",
				name: "content",
				origin: "extension",
				tokens: charsToTokens(content.length),
				text: content,
			});
		for (const [name, section] of Object.entries(sent.sections ?? {})) {
			if (section === null) continue;
			items.push({
				group: "system",
				name,
				origin: PI_SECTIONS.includes(name) ? "Pi" : "extension",
				tokens: charsToTokens(section.length),
				text: section,
			});
		}
	}
	const hidden = new Set(input.hiddenTools);
	const infos = new Map(input.tools.map((info) => [info.name, info]));
	for (const tool of getCurrentTools(request)) {
		if (hidden.has(tool.name)) continue;
		const declaration = toToolDeclaration(tool);
		const info = infos.get(tool.name);
		items.push({
			group: "tools",
			name: tool.name,
			origin: info ? toolOrigin(info) : "extension",
			tokens: charsToTokens(JSON.stringify(declaration).length),
			text: JSON.stringify(declaration, null, 2),
		});
	}
	items.push(...messageInjections(input.request, input.session));
	return items;
}

function customType(message: RequestMessage): string {
	return message.role === "custom" ? message.customType : "";
}

// why: the idea comes from pi-context-view 0.8.3 (`capture/diff.ts`): a timestamp and the session fields are never sent to the model.
function modelFacingPart(message: RequestMessage): unknown {
	switch (message.role) {
		case "user":
		case "assistant":
		case "custom":
			return message.content;
		case "toolResult":
			return {
				toolCallId: message.toolCallId,
				toolName: message.toolName,
				content: message.content,
				isError: message.isError,
			};
		case "branchSummary":
		case "compactionSummary":
			return message.summary;
		default: {
			const { timestamp: _timestamp, ...rest } = message;
			return rest;
		}
	}
}

function messageKey(message: RequestMessage): string {
	return JSON.stringify([
		message.role,
		customType(message),
		modelFacingPart(message),
	]);
}

function messageText(message: RequestMessage): string {
	const parts: string[] = [];
	for (const converted of convertToLlm([message])) {
		if (converted.role === "user" || converted.role === "toolResult") {
			parts.push(contentText(converted.content));
		} else if (converted.role === "assistant") {
			for (const block of converted.content) {
				if (block.type === "text") parts.push(block.text);
				else if (block.type === "thinking") parts.push(block.thinking);
				else if (block.type === "toolCall")
					parts.push(`${block.name} ${JSON.stringify(block.arguments)}`);
			}
		}
	}
	return parts.join("\n\n");
}

function messageInjection(message: RequestMessage): ContextInjection {
	return {
		group: "messages",
		name: message.role === "custom" ? message.customType : message.role,
		origin: "extension",
		tokens: estimateTokens(message),
		text: messageText(message),
	};
}

function messageInjections(
	request: readonly RequestMessage[],
	session: readonly RequestMessage[],
): ContextInjection[] {
	const sent = request.filter((message) => message.role !== "system");
	const saved = session.filter((message) => message.role !== "system");
	const sentKeys = sent.map(messageKey);
	const savedKeys = saved.map(messageKey);
	let prefix = 0;
	while (
		prefix < sent.length &&
		prefix < saved.length &&
		sentKeys[prefix] === savedKeys[prefix]
	)
		prefix += 1;
	let suffix = 0;
	while (
		suffix < sent.length - prefix &&
		suffix < saved.length - prefix &&
		sentKeys[sent.length - 1 - suffix] === savedKeys[saved.length - 1 - suffix]
	)
		suffix += 1;
	const middleSent = sent.slice(prefix, sent.length - suffix);
	const middleSaved = saved.slice(prefix, saved.length - suffix);
	const items: ContextInjection[] = [];
	const removed: ContextInjection[] = [];
	const appendCustom = (message: RequestMessage | undefined) => {
		if (message?.role === "custom") items.push(messageInjection(message));
	};
	for (let index = 0; index < prefix; index += 1) appendCustom(sent[index]);
	const middleLength = Math.max(middleSent.length, middleSaved.length);
	for (let index = 0; index < middleLength; index += 1) {
		const current = middleSent[index];
		const previous = middleSaved[index];
		const paired =
			current !== undefined &&
			previous !== undefined &&
			current.role === previous.role &&
			customType(current) === customType(previous);
		if (current) {
			items.push(
				paired
					? { ...messageInjection(current), requestOnly: "changed" }
					: { ...messageInjection(current), requestOnly: "added" },
			);
		}
		if (previous && !paired)
			removed.push({ ...messageInjection(previous), requestOnly: "removed" });
	}
	for (let index = sent.length - suffix; index < sent.length; index += 1)
		appendCustom(sent[index]);
	items.push(...removed);
	return items;
}

function toolOrigin(info: ToolInfo): string {
	const { source, origin, path } = info.sourceInfo;
	if (source === "builtin" || source === "sdk") return "Pi";
	if (origin === "package") return source.replace(/@[^/@]+$/, "");
	const name = basename(path, extname(path));
	if (name === "index" || name === "pi-extension")
		return basename(dirname(path));
	return name;
}
