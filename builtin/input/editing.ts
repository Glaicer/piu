import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { chordFromEvent, shortcutSpec } from "../../src/keybindings.ts";

const kills: Readonly<Record<string, (field: TextareaRenderable) => boolean>> =
	{
		"ctrl+w": (field) => field.deleteWordBackward(),
		"alt+backspace": (field) => field.deleteWordBackward(),
		"alt+d": (field) => field.deleteWordForward(),
		"alt+delete": (field) => field.deleteWordForward(),
		"ctrl+u": (field) => field.deleteToLineStart(),
		"ctrl+k": (field) => field.deleteToLineEnd(),
	};

const segmenter = new Intl.Segmenter();

function jump(field: TextareaRenderable, target: string, direction: 1 | -1) {
	const before = field.getTextRange(0, field.cursorOffset);
	const text = field.plainText;
	const candidates = [...segmenter.segment(text)].filter(
		({ segment, index }) =>
			segment === target &&
			(direction === 1 ? index > before.length : index < before.length),
	);
	const match = direction === 1 ? candidates[0] : candidates.at(-1);
	if (!match) return;
	const lines = text.slice(0, match.index).split("\n");
	field.clearSelection();
	field.setCursor(lines.length - 1, Bun.stringWidth(lines.at(-1) ?? ""));
}

export function createPromptEditing() {
	const ring: string[] = [];
	let seeking: 1 | -1 | undefined;
	let yanked:
		| { index: number; start: number; end: number; text: string }
		| undefined;

	return (field: TextareaRenderable, event: KeyEvent) => {
		if (event.super || event.hyper) {
			seeking = undefined;
			yanked = undefined;
			return false;
		}
		const key = shortcutSpec([chordFromEvent(event)]);
		if (seeking !== undefined) {
			const direction = seeking;
			seeking = undefined;
			const text = event.name === "space" ? " " : event.sequence;
			if (
				!event.ctrl &&
				!event.meta &&
				[...segmenter.segment(text)].length === 1 &&
				!/\p{Cc}/u.test(text)
			) {
				jump(field, text, direction);
				return true;
			}
			if (key === "escape") return true;
		}
		const previous = yanked;
		yanked = undefined;
		// why: legacy terminals can encode Ctrl+- as Ctrl+_ (ASCII unit separator).
		if (event.source === "raw" && key === "ctrl+_") {
			field.undo();
			return true;
		}
		if (key === "ctrl+]" || key === "ctrl+alt+]") {
			seeking = key === "ctrl+]" ? 1 : -1;
			return true;
		}
		const kill = kills[key];
		if (kill) {
			const original = field.plainText;
			kill(field);
			const length = original.length - field.plainText.length;
			if (length > 0) {
				const start = field.getTextRange(0, field.cursorOffset).length;
				ring.unshift(original.slice(start, start + length));
				if (ring.length > 60) ring.pop();
			}
			return true;
		}
		if (key !== "ctrl+y" && key !== "alt+y") return false;
		let index = 0;
		if (key === "alt+y") {
			if (
				!previous ||
				ring.length < 2 ||
				field.cursorOffset !== previous.end ||
				field.plainText !== previous.text ||
				field.hasSelection()
			)
				return true;
			index = (previous.index + 1) % ring.length;
			field.setSelection(previous.start, previous.end);
		}
		const text = ring[index];
		if (text === undefined) return true;
		const start = field.getSelection()?.start ?? field.cursorOffset;
		field.insertText(text);
		yanked = { index, start, end: field.cursorOffset, text: field.plainText };
		return true;
	};
}
