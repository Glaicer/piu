import { expect, test } from "bun:test";
import { formatDuration } from "../builtin/chat/tool-card.tsx";

test.each([
	[9, "  9ms"],
	[29, " 29ms"],
	[99, " 99ms"],
	[100, " 0.1s"],
	[510, " 0.5s"],
	[1230, " 1.2s"],
	[9950, "  10s"],
	[12_600, "  13s"],
	[120_100, " 120s"],
	[999_000, " 999s"],
	[999_001, ">999s"],
])("formats %d ms in a five-column field", (ms, expected) => {
	expect(formatDuration(ms)).toBe(expected);
});
