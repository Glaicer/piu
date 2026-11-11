import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type FauxStep, prepareFixture } from "./harness.ts";
import {
	alive,
	eventually,
	leftModes,
	spawnPiu,
	waitForPid,
} from "./process.ts";

for (const alias of ["/q", "/quit", "/exit"]) {
	test(`${alias} closes piu and its Backend and leaves the terminal clean`, async () => {
		const fixture = prepareFixture({ script: { replies: [] } });
		try {
			await using piu = spawnPiu(fixture);
			await piu.waitForText("faux-1");
			const [backend] = await eventually(() => {
				const started = piu.pids().filter((e) => e.event === "start");
				return started.length > 0 && started;
			}, "the Backend to start");

			piu.submit(alias);

			expect(await piu.proc.exited).toBe(0);
			expect(alive(backend?.pid ?? 0)).toBe(false);
			expect(piu.pids().map((e) => e.event)).toContain("shutdown");
			expect(leftModes(piu.raw)).toEqual({ on: [], cursorShown: true });
		} finally {
			fixture.removeDir();
		}
	}, 20000);
}

// why: `exec` makes the shell the sleeping process itself, so one pid stands for the whole tool run.
function runningTool(dir: string): { step: FauxStep; pidFile: string } {
	const pidFile = join(dir, "tool.pid");
	return {
		pidFile,
		step: {
			toolCalls: [
				{
					name: "bash",
					args: { command: `echo $$ > ${pidFile}; exec sleep 600` },
				},
			],
		},
	};
}

test("a quit command works while the agent runs a tool, and ends the tool", async () => {
	const fixture = prepareFixture({ script: { replies: [] } });
	const { step, pidFile } = runningTool(fixture.dir);
	fixture.setScript({ replies: [step, "never"] });
	try {
		await using piu = spawnPiu(fixture);
		await piu.waitForText("faux-1");
		piu.submit("run it");
		const toolPid = await waitForPid(pidFile, "the tool to start");
		expect(alive(toolPid)).toBe(true);

		piu.submit("/q");

		expect(await piu.proc.exited).toBe(0);
		expect(alive(toolPid)).toBe(false);
		expect(piu.text).not.toContain("never");
	} finally {
		fixture.removeDir();
	}
}, 20000);

// why: the reply names the prompt it answers, so a line restored from the saved session is never taken for the answer to a new prompt.
const countReply = { replies: ["{lastUser} has {messages}"] };

test("/restart starts a new piu and Backend and continues the saved session", async () => {
	const fixture = prepareFixture({ script: countReply, persistSession: true });
	try {
		await using piu = spawnPiu(fixture);
		await piu.waitForText("faux-1");
		piu.submit("Hello");
		await piu.waitForText('"Hello" has 1');
		const [oldBackend] = await piu.waitForStarts(1);
		if (!oldBackend) throw new Error("no Backend");

		const beforeRestart = piu.mark();
		piu.submit("/restart");

		const [, newBackend] = await piu.waitForStarts(2);
		if (!newBackend) throw new Error("no new Backend");
		expect(alive(oldBackend.pid)).toBe(false);
		expect(alive(oldBackend.ppid)).toBe(false);
		expect(newBackend.pid).not.toBe(oldBackend.pid);
		expect(newBackend.ppid).not.toBe(oldBackend.ppid);
		expect(alive(newBackend.ppid)).toBe(true);
		expect(piu.proc.exitCode).toBeNull();
		await piu.waitForText('"Hello" has 1', beforeRestart);
		const restarted = piu.mark();
		piu.submit("again");
		await piu.waitForText('"again" has 3', restarted);
	} finally {
		fixture.removeDir();
	}
}, 20000);

test("/restart after /new keeps the empty session instead of the last saved one", async () => {
	const fixture = prepareFixture({ script: countReply, persistSession: true });
	try {
		await using piu = spawnPiu(fixture);
		await piu.waitForText("faux-1");
		piu.submit("Hello");
		await piu.waitForText('"Hello" has 1');
		piu.submit("/new");
		await eventually(
			() => piu.pids().some((entry) => entry.event === "session_start:new"),
			"the new session to start",
		);

		const beforeRestart = piu.mark();
		piu.submit("/restart");
		await piu.waitForStarts(2);
		await piu.waitForText("faux-1", beforeRestart);
		const restarted = piu.mark();
		piu.submit("fresh");

		await piu.waitForText('"fresh" has 1', restarted);
	} finally {
		fixture.removeDir();
	}
}, 20000);

test("/restart in no-session mode starts empty and still saves nothing", async () => {
	const fixture = prepareFixture({ script: countReply });
	try {
		await using piu = spawnPiu(fixture);
		await piu.waitForText("faux-1");
		piu.submit("Hello");
		await piu.waitForText('"Hello" has 1');

		const beforeRestart = piu.mark();
		piu.submit("/restart");
		await piu.waitForStarts(2);
		await piu.waitForText("faux-1", beforeRestart);
		const restarted = piu.mark();
		piu.submit("again");

		await piu.waitForText('"again" has 1', restarted);
		expect(existsSync(join(fixture.dir, "agent", "sessions"))).toBe(false);
	} finally {
		fixture.removeDir();
	}
}, 20000);

test("/restart while the agent runs a tool ends the tool and does not run it again", async () => {
	const fixture = prepareFixture({
		script: { replies: [] },
		persistSession: true,
	});
	const { step, pidFile } = runningTool(fixture.dir);
	fixture.setScript({ replies: [step, "never"] });
	try {
		await using piu = spawnPiu(fixture);
		await piu.waitForText("faux-1");
		piu.submit("run it");
		const toolPid = await waitForPid(pidFile, "the tool to start");

		piu.submit("/restart");

		await piu.waitForStarts(2);
		expect(alive(toolPid)).toBe(false);
		await Bun.sleep(700);
		expect(Number.parseInt(readFileSync(pidFile, "utf8"), 10)).toBe(toolPid);
		expect(piu.starts()).toHaveLength(2);
	} finally {
		fixture.removeDir();
	}
}, 20000);

for (const command of ["/q", "/restart"]) {
	test(`${command} works after the Backend has died`, async () => {
		const fixture = prepareFixture({
			script: { replies: ["Fine"], crash: { code: 3, stderr: "kaboom\n" } },
			persistSession: true,
		});
		try {
			await using piu = spawnPiu(fixture);
			await piu.waitForText("faux-1");
			piu.submit("Hello");
			await piu.waitForText("Fine");
			piu.submit("/crash");
			await piu.waitForText("kaboom");

			piu.submit(command);

			if (command === "/q") expect(await piu.proc.exited).toBe(0);
			else await piu.waitForStarts(2);
		} finally {
			fixture.removeDir();
		}
	}, 20000);
}

test("a restart that fails to start shows the error and leaves the terminal clean", async () => {
	const fixture = prepareFixture({ script: countReply });
	try {
		await using piu = spawnPiu(fixture);
		await piu.waitForText("faux-1");
		writeFileSync(join(fixture.home, "config.json"), '{"bogusKey": 1}');

		piu.submit("/restart");

		expect(await piu.proc.exited).toBe(1);
		expect(piu.text).toContain("bogusKey");
		expect(leftModes(piu.raw)).toEqual({ on: [], cursorShown: true });
	} finally {
		fixture.removeDir();
	}
}, 20000);

function neighborScript(dir: string) {
	const pidFile = join(dir, "tool.pid");
	const release = join(dir, "release");
	const command = `echo $$ > ${pidFile}; while [ ! -e ${release} ]; do sleep 0.05; done`;
	return {
		pidFile,
		release,
		script: {
			replies: [
				{ toolCalls: [{ name: "bash", args: { command } }] },
				"{lastUser} has {messages}",
				"{lastUser} has {messages}",
			],
		},
	};
}

for (const command of ["/q", "/quit", "/exit", "/restart"]) {
	test(`${command} leaves another piu on the same Config running its task and talking`, async () => {
		const fixture = prepareFixture({
			script: { replies: [] },
			persistSession: true,
		});
		const { pidFile, release, script } = neighborScript(fixture.dir);
		fixture.setScript(script);
		try {
			await using closing = spawnPiu(fixture);
			await closing.waitForText("faux-1");
			const [closingBackend] = await closing.waitForStarts(1);
			await using neighbor = spawnPiu(fixture);
			await neighbor.waitForText("faux-1");
			const [, neighborBackend] = await eventually(() => {
				const started = closing.starts();
				return started.length >= 2 && started;
			}, "both Backends to start");
			neighbor.submit("work");
			const toolPid = await waitForPid(pidFile, "the neighbor's task to start");

			closing.submit(command);
			if (command === "/restart") await closing.waitForStarts(3);
			else expect(await closing.proc.exited).toBe(0);

			expect(alive(closingBackend?.pid ?? 0)).toBe(false);
			expect(neighbor.proc.exitCode).toBeNull();
			expect(alive(neighborBackend?.pid ?? 0)).toBe(true);
			expect(alive(toolPid)).toBe(true);
			writeFileSync(release, "");
			await neighbor.waitForText('"work" has 2');
			const before = neighbor.mark();
			neighbor.submit("more");
			await neighbor.waitForText('"more" has 4', before);
		} finally {
			fixture.removeDir();
		}
	}, 30000);
}
