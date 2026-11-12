import { isThinkingLevel } from "./model-selection.ts";

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

// why: Pi applies --model over --models, and replicating its glob/fuzzy resolver here would drift on every Pi update; without --model, any valid scoped suffix is treated as explicit so piu never restores over a CLI choice.
export function explicitThinking(args: readonly string[]) {
	const thinking = optionValue(args, "--thinking");
	if (thinking !== undefined && isThinkingLevel(thinking)) return true;
	const cliModel = optionValue(args, "--model");
	if (cliModel !== undefined) return thinkingLevel(cliModel) !== undefined;
	return (optionValue(args, "--models") ?? "")
		.split(",")
		.some((pattern) => thinkingLevel(pattern.trim()) !== undefined);
}

function thinkingLevel(text: string) {
	const colon = text.lastIndexOf(":");
	if (colon < 0) return undefined;
	const level = text.slice(colon + 1);
	return isThinkingLevel(level) ? level : undefined;
}
