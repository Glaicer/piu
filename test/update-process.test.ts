import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareFixture } from "./harness.ts";
import { alive, eventually, spawnPiu, waitForPid } from "./process.ts";
import { updateFixture } from "./update-install.ts";

const preload = join(import.meta.dir, "fixtures/update-releases.ts");

test("a slow RPC startup after /update still opens the changelog once the Backend is ready", async () => {
	const install = updateFixture("pi-bolt", "npm", { holdRpcAfterUpdate: true });
	const fixture = prepareFixture({
		backendCommand: install.command,
		persistSession: true,
		script: { replies: [] },
	});
	const env = {
		...install.env,
		BUN_OPTIONS: `--preload=${preload}`,
		PI_OFFLINE: "",
		PI_SKIP_VERSION_CHECK: "",
	};
	try {
		await using piu = spawnPiu(fixture, { env });
		await piu.waitForText("faux-1");
		piu.submit("/update");
		await waitForPid(
			join(install.dir, "rpc-waiting"),
			"the restarted RPC launcher",
		);
		await Bun.sleep(2200);
		writeFileSync(join(install.dir, "rpc-release"), "");
		await piu.waitForText("Verified update note");
		piu.type("\x1b[27u");
		piu.submit("/q");
		expect(await piu.proc.exited).toBe(0);
	} finally {
		fixture.removeDir();
		install.cleanup();
	}
}, 30000);

test("the package-installed Pi-Bolt RPC launch retains its lease until the first response", async () => {
	const install = updateFixture("pi-bolt", "npm", { holdRpcStartup: true });
	const fixture = prepareFixture({
		backendCommand: install.command,
		script: { replies: [] },
	});
	const env = {
		...install.env,
		BUN_OPTIONS: `--preload=${preload}`,
		PI_OFFLINE: "",
		PI_SKIP_VERSION_CHECK: "",
	};
	try {
		await using first = spawnPiu(fixture, { env });
		await waitForPid(
			join(install.dir, "rpc-waiting"),
			"the RPC launcher to start",
		);
		await using starting = spawnPiu(fixture, { env });
		const result = await eventually(
			() => starting.proc.exitCode !== null && { code: starting.proc.exitCode },
			"the second launch to refuse the busy installation",
		);
		expect(result.code).toBe(1);
		expect(starting.text).toContain("Another update is already running");
		writeFileSync(join(install.dir, "rpc-release"), "");
		await first.waitForText("faux-1");
		first.submit("/q");
		expect(await first.proc.exited).toBe(0);
	} finally {
		fixture.removeDir();
		install.cleanup();
	}
}, 30000);

test("Pi-Bolt's lazy native download stays inside the update lock, including another instance's --version probe", async () => {
	const install = updateFixture("pi-bolt", "npm", { holdNativeDownload: true });
	const fixture = prepareFixture({
		backendCommand: install.command,
		persistSession: true,
		script: { replies: [] },
	});
	const env = {
		...install.env,
		BUN_OPTIONS: `--preload=${preload}`,
		PI_OFFLINE: "",
		PI_SKIP_VERSION_CHECK: "",
	};
	try {
		await using initiator = spawnPiu(fixture, { env });
		await initiator.waitForText("faux-1");
		await using neighbor = spawnPiu(fixture, { env });
		await neighbor.waitForText("faux-1");
		initiator.submit("/update");
		await eventually(
			() => existsSync(join(install.dir, "native-starts")),
			"the lazy native download to start",
		);
		neighbor.submit("/update");
		await neighbor.waitForText("Another update is already running");
		expect(
			readFileSync(join(install.dir, "native-starts"), "utf8")
				.trim()
				.split("\n"),
		).toHaveLength(1);
		await using starting = spawnPiu(fixture, { env });
		expect(await starting.proc.exited).toBe(1);
		expect(starting.text).toContain("Another update is already running");
		expect(
			readFileSync(join(install.dir, "native-starts"), "utf8")
				.trim()
				.split("\n"),
		).toHaveLength(1);
		writeFileSync(join(install.dir, "native-release"), "");
		await initiator.waitForStarts(3);
		await initiator.waitForText("Verified update note");
		initiator.type("\x1b[27u");
		initiator.submit("/q");
		neighbor.submit("/q");
		expect(await initiator.proc.exited).toBe(0);
		expect(await neighbor.proc.exited).toBe(0);
	} finally {
		fixture.removeDir();
		install.cleanup();
	}
}, 30000);

test("closing the initiator does not release the installation lock while its installer still runs", async () => {
	const install = updateFixture("pi", "npm");
	writeFileSync(join(install.dir, "hold"), "");
	const fixture = prepareFixture({
		backendCommand: install.command,
		persistSession: true,
		script: { replies: [] },
	});
	const env = {
		...install.env,
		BUN_OPTIONS: `--preload=${preload}`,
		PI_OFFLINE: "",
		PI_SKIP_VERSION_CHECK: "",
	};
	try {
		await using initiator = spawnPiu(fixture, { env });
		await initiator.waitForText("faux-1");
		initiator.submit("/update");
		await initiator.waitForText("Downloading fixture release");
		const installerPid = install.calls()[0]?.pid ?? 0;
		initiator.submit("/q");
		expect(await initiator.proc.exited).toBe(0);
		expect(alive(installerPid)).toBe(true);
		await using neighbor = spawnPiu(fixture, { env });
		await neighbor.waitForText("faux-1");
		neighbor.submit("/update");
		await neighbor.waitForText("Another update is already running");
		expect(install.calls()).toHaveLength(1);
		writeFileSync(join(install.dir, "release"), "");
		await eventually(
			() =>
				readFileSync(join(install.dir, "version-output"), "utf8").trim() ===
				"1.0.1",
			"the detached installer to finish",
		);
		await eventually(
			() => !alive(installerPid),
			"the installer process to end",
		);
		const mark = neighbor.mark();
		neighbor.submit("/update");
		await neighbor.waitForText("already up to date", mark);
		expect(install.calls()).toHaveLength(1);
		neighbor.submit("/q");
		expect(await neighbor.proc.exited).toBe(0);
	} finally {
		fixture.removeDir();
		install.cleanup();
	}
}, 30000);

test("the automatic update restart stops active work without replaying it in the new Backend", async () => {
	const install = updateFixture("pi", "curl");
	const fixture = prepareFixture({
		backendCommand: install.command,
		persistSession: true,
		script: { replies: [] },
	});
	const toolPidFile = join(fixture.dir, "active-tool.pid");
	const starts = join(fixture.dir, "tool-starts");
	fixture.setScript({
		replies: [
			{
				toolCalls: [
					{
						name: "bash",
						args: {
							command: `echo $$ > '${toolPidFile}'; echo started >> '${starts}'; while [ -d '${fixture.dir}' ] && [ ! -e '${join(fixture.dir, "active-release")}' ]; do sleep 0.05; done`,
						},
					},
				],
			},
			"Never auto-replayed",
		],
	});
	try {
		await using piu = spawnPiu(fixture, {
			env: {
				...install.env,
				BUN_OPTIONS: `--preload=${preload}`,
				PI_OFFLINE: "",
				PI_SKIP_VERSION_CHECK: "",
			},
		});
		await piu.waitForText("faux-1");
		piu.submit("work");
		const toolPid = await waitForPid(toolPidFile, "the active work to start");
		fixture.setScript({ replies: ["{lastUser} has {messages}"] });
		piu.submit("/update");
		await piu.waitForStarts(2);
		await piu.waitForText("Verified update note");
		expect(alive(toolPid)).toBe(false);
		expect(readFileSync(starts, "utf8")).toBe("started\n");
		const mark = piu.mark();
		piu.type("\x1b[27u");
		piu.submit("follow-up");
		await piu.waitForText('"follow-up" has 3', mark);
		expect(piu.text).not.toContain("Never auto-replayed");
		piu.submit("/q");
		expect(await piu.proc.exited).toBe(0);
	} finally {
		fixture.removeDir();
		install.cleanup();
	}
}, 30000);

test("/update replaces both processes, resumes only the saved session and shows the installed changelog", async () => {
	const install = updateFixture("pi", "npm", { rotate: true });
	const fixture = prepareFixture({
		backendCommand: install.command,
		persistSession: true,
		script: { replies: ["{lastUser} has {messages}"] },
	});
	try {
		await using piu = spawnPiu(fixture, {
			env: {
				...install.env,
				BUN_OPTIONS: `--preload=${preload}`,
				PI_OFFLINE: "",
				PI_SKIP_VERSION_CHECK: "",
			},
		});
		await piu.waitForText("faux-1");
		piu.submit("Remember");
		await piu.waitForText('"Remember" has 1');
		const [old] = await piu.waitForStarts(1);
		const mark = piu.mark();
		piu.submit("/update");
		const [, next] = await piu.waitForStarts(2);
		expect(alive(old?.pid ?? 0)).toBe(false);
		expect(alive(old?.ppid ?? 0)).toBe(false);
		expect(next?.pid).not.toBe(old?.pid);
		expect(next?.ppid).not.toBe(old?.ppid);
		await piu.waitForText("Verified update note", mark);
		piu.type("\x1b");
		await piu.waitForText('"Remember" has 1', mark);
		const resumed = piu.mark();
		piu.submit("again");
		await piu.waitForText('"again" has 3', resumed);
		expect(install.calls()).toHaveLength(1);
		piu.submit("/q");
		expect(await piu.proc.exited).toBe(0);
	} finally {
		fixture.removeDir();
		install.cleanup();
	}
}, 30000);

test("two instances cannot install concurrently and updating one leaves the neighbor's active work alive", async () => {
	const install = updateFixture("pi-bolt", "curl");
	writeFileSync(join(install.dir, "hold"), "");
	const fixture = prepareFixture({
		backendCommand: install.command,
		persistSession: true,
		script: { replies: [] },
	});
	const toolPidFile = join(fixture.dir, "tool.pid");
	const release = join(fixture.dir, "tool-release");
	const firstTmp = join(fixture.dir, "first-tmp");
	const secondTmp = join(fixture.dir, "second-tmp");
	mkdirSync(firstTmp);
	mkdirSync(secondTmp);
	fixture.setScript({
		replies: [
			{
				toolCalls: [
					{
						name: "bash",
						args: {
							command: `echo $$ > '${toolPidFile}'; while [ -d '${fixture.dir}' ] && [ ! -e '${release}' ]; do sleep 0.05; done`,
						},
					},
				],
			},
			"{lastUser} has {messages}",
			"{lastUser} has {messages}",
		],
	});
	const env = {
		...install.env,
		BUN_OPTIONS: `--preload=${preload}`,
		PI_OFFLINE: "",
		PI_SKIP_VERSION_CHECK: "",
	};
	try {
		await using initiator = spawnPiu(fixture, {
			env: { ...env, TMPDIR: firstTmp },
		});
		await initiator.waitForText("faux-1");
		const [old] = await initiator.waitForStarts(1);
		await using neighbor = spawnPiu(fixture, {
			env: { ...env, TMPDIR: secondTmp },
		});
		await neighbor.waitForText("faux-1");
		const [, other] = await initiator.waitForStarts(2);
		neighbor.submit("work");
		const toolPid = await waitForPid(toolPidFile, "the neighbor's tool");
		initiator.submit("/update");
		await initiator.waitForText("Downloading fixture release");
		initiator.submit("/update");
		await initiator.waitForText("already running");
		neighbor.submit("/update");
		await neighbor.waitForText("Another update is already running");
		expect(install.calls()).toHaveLength(1);
		expect(alive(toolPid)).toBe(true);
		writeFileSync(join(install.dir, "release"), "");
		await initiator.waitForStarts(3);
		await initiator.waitForText("Verified update note");
		expect(alive(old?.pid ?? 0)).toBe(false);
		expect(alive(other?.pid ?? 0)).toBe(true);
		expect(alive(other?.ppid ?? 0)).toBe(true);
		expect(alive(toolPid)).toBe(true);
		expect(neighbor.proc.exitCode).toBeNull();
		writeFileSync(release, "");
		await neighbor.waitForText('"work" has 2');
		const mark = neighbor.mark();
		neighbor.submit("more");
		await neighbor.waitForText('"more" has 4', mark);
		const dismissed = initiator.mark();
		initiator.type("\x1b[27u");
		initiator.type("ready-to-quit");
		await initiator.waitForText("ready-to-quit", dismissed);
		initiator.type("\x7f".repeat("ready-to-quit".length));
		initiator.submit("/q");
		neighbor.submit("/q");
		await eventually(
			() => initiator.proc.exitCode === 0 && neighbor.proc.exitCode === 0,
			"both instances to quit",
		);
	} finally {
		fixture.removeDir();
		install.cleanup();
	}
}, 40000);
