import { expect, test } from "bun:test";
import { restartArgs } from "../src/restart.ts";

test("the active session replaces every session choice the app was started with", () => {
	expect(
		restartArgs(
			["--model", "faux/faux-1", "-c", "--session", "old.jsonl", "-r"],
			"/s/now.jsonl",
		),
	).toEqual(["--model", "faux/faux-1", "--session", "/s/now.jsonl"]);
	expect(
		restartArgs(["--fork", "other", "--session-id", "x"], "/s/now.jsonl"),
	).toEqual(["--session", "/s/now.jsonl"]);
});

test("without a session file no session choice is added or kept", () => {
	expect(restartArgs(["--no-session", "--continue"], null)).toEqual([
		"--no-session",
	]);
});
