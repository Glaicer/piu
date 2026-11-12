import { isThinkingLevel } from "./model-selection.ts";
import type { ModelInfo } from "./pi-state.ts";

const resumeSession = new Set(["-r", "--resume"]);
const continueSession = new Set(["-c", "--continue"]);
export const selectsSession = new Set([...continueSession, ...resumeSession]);
export const selectsSessionWithValue = new Set([
	"--session",
	"--session-id",
	"--fork",
]);

export function optionValue(args: readonly string[], name: string) {
	let value: string | undefined;
	for (const [index, arg] of args.entries()) {
		if (arg === name && index + 1 < args.length) value = args[index + 1];
	}
	return value;
}

export function explicitSession(args: readonly string[]) {
	return (
		args.some((arg) => resumeSession.has(arg)) ||
		optionValue(args, "--session") !== undefined ||
		optionValue(args, "--fork") !== undefined
	);
}

export function maybeSession(args: readonly string[]) {
	return (
		args.some((arg) => continueSession.has(arg)) ||
		optionValue(args, "--session-id") !== undefined
	);
}

export function modelOverride(args: readonly string[]) {
	return ["--model", "--provider", "--models"].some(
		(name) => optionValue(args, name) !== undefined,
	);
}

// why: Pi applies --model over --models, and a scoped thinking suffix only belongs to the scoped model it resolved, so mirror that order instead of taking the last model option in argv.
export function explicitThinking(
	args: readonly string[],
	model: ModelInfo | null,
) {
	const thinking = optionValue(args, "--thinking");
	if (thinking !== undefined && isThinkingLevel(thinking)) return true;
	const cliModel = optionValue(args, "--model");
	if (cliModel !== undefined) return thinkingLevel(cliModel) !== undefined;
	if (!model) return false;
	return scopedThinking(optionValue(args, "--models"), model) !== undefined;
}

function thinkingLevel(text: string) {
	const colon = text.lastIndexOf(":");
	if (colon < 0) return undefined;
	const level = text.slice(colon + 1);
	return isThinkingLevel(level) ? level : undefined;
}

function scopedThinking(value: string | undefined, model: ModelInfo) {
	for (const raw of (value ?? "").split(",")) {
		const pattern = raw.trim();
		if (!pattern) continue;
		const level = thinkingLevel(pattern);
		const base = level ? pattern.slice(0, pattern.lastIndexOf(":")) : pattern;
		if (matches(base, model)) return level;
	}
	return undefined;
}

function matches(pattern: string, model: ModelInfo) {
	const text = pattern.toLowerCase();
	const provider = model.provider.toLowerCase();
	const id = model.id.toLowerCase();
	const full = `${provider}/${id}`;
	const isGlob = text.includes("*") || text.includes("?") || text.includes("[");
	if (!isGlob) {
		if (text === full || text === id) return true;
		const slash = text.indexOf("/");
		if (slash >= 0 && text.slice(0, slash) === provider) {
			const rest = text.slice(slash + 1);
			return rest.length > 0 && id.includes(rest);
		}
		return id.includes(text) || model.name.toLowerCase().includes(text);
	}
	const glob = globRegExp(text);
	return glob.test(full) || glob.test(id);
}

function globRegExp(pattern: string) {
	let source = "^";
	for (let index = 0; index < pattern.length; index++) {
		const char = pattern.charAt(index);
		if (char === "*") source += ".*";
		else if (char === "?") source += ".";
		else if (char === "[") {
			const end = pattern.indexOf("]", index + 1);
			if (end < 0) source += "\\[";
			else {
				source += pattern.slice(index, end + 1);
				index = end;
			}
		} else source += char.replace(/[.+^${}()|\\]/g, "\\$&");
	}
	return new RegExp(`${source}$`, "i");
}
