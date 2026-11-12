import { expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeInstall, families, managers } from "./backend-install.ts";
import { startPiu } from "./harness.ts";
import { eventually } from "./process.ts";
import {
	json,
	piBoltLatestUrl,
	piLatestUrl,
	releaseSources,
} from "./releases.ts";
import { updateFixture } from "./update-install.ts";

for (const family of families) {
	for (const manager of managers) {
		test(`${family} ${manager}: /update targets this installation, verifies the version and restarts`, async () => {
			const fixture = updateFixture(family, manager);
			try {
				await using piu = await startPiu({
					backendCommand: fixture.command,
					appEnv: fixture.env,
					updateCheck: fixture.sources,
					script: { replies: [] },
				});
				await piu.waitForFrame((f) => f.includes("faux-1"));
				await fixture.sources.called(
					family === "pi" ? piLatestUrl : piBoltLatestUrl,
				);
				expect(fixture.calls()).toHaveLength(0);
				await piu.mockInput.typeText("/update");
				piu.mockInput.pressEnter();
				await eventually(() => piu.exits[0], "the automatic restart");
				expect(piu.exits[0]?.restartArgs).toBeDefined();
				expect(fixture.calls()).toHaveLength(1);
			} finally {
				fixture.cleanup();
			}
		});
	}
}

test("Pi-Bolt's first run after a package update can download its signed build before verification completes", async () => {
	const fixture = updateFixture("pi-bolt", "npm", { verifyDelaySeconds: 11 });
	try {
		await using piu = await startPiu({
			backendCommand: fixture.command,
			appEnv: fixture.env,
			updateCheck: fixture.sources,
			script: { replies: [] },
		});
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Verifying installed version"));
		expect(piu.exits).toHaveLength(0);
		await eventually(
			() => piu.exits[0],
			"the first-run download and verification",
			15000,
		);
		expect(fixture.calls()).toHaveLength(1);
	} finally {
		fixture.cleanup();
	}
}, 20000);

for (const family of families) {
	test(`${family}: pnpm's isolated v11 global installation is updated in its own root`, async () => {
		const fixture = updateFixture(family, "pnpm", {
			pnpmLayout: "v11",
			pnpmRootName: "custom-packages",
		});
		try {
			await using piu = await startPiu({
				backendCommand: fixture.command,
				appEnv: fixture.env,
				updateCheck: fixture.sources,
				script: { replies: [] },
			});
			await piu.mockInput.typeText("/update");
			piu.mockInput.pressEnter();
			await eventually(() => piu.exits[0], "the isolated global update");
			expect(fixture.calls()).toHaveLength(1);
		} finally {
			fixture.cleanup();
		}
	});
}

test("pnpm refuses to choose when two global install groups contain the Backend", async () => {
	const fixture = updateFixture("pi", "pnpm", {
		pnpmLayout: "v11",
		pnpmSecondGroup: true,
	});
	try {
		await using piu = await startPiu({
			backendCommand: fixture.command,
			appEnv: fixture.env,
			updateCheck: fixture.sources,
			script: { replies: [] },
		});
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) =>
			f.includes("More than one pnpm global install group"),
		);
		expect(fixture.calls()).toHaveLength(0);
		expect(piu.exits).toHaveLength(0);
	} finally {
		fixture.cleanup();
	}
});

test("a failed installation releases its lock so /update can be retried", async () => {
	const fixture = updateFixture("pi", "npm");
	fixture.setOutcome("failure");
	try {
		await using piu = await startPiu({
			backendCommand: fixture.command,
			appEnv: fixture.env,
			updateCheck: fixture.sources,
			script: { replies: [] },
		});
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame(
			(f) => f.includes("Installer failed") && f.includes("permission denied"),
		);
		expect(piu.exits).toHaveLength(0);
		fixture.setOutcome("success");
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await eventually(() => piu.exits[0], "the successful retry");
		expect(fixture.calls()).toHaveLength(2);
	} finally {
		fixture.cleanup();
	}
});

for (const family of families) {
	test(`${family}: a curl installation refuses an overriding self-update command`, async () => {
		const fixture = updateFixture(family, "curl");
		try {
			await using piu = await startPiu({
				backendCommand: fixture.command,
				appEnv: {
					...fixture.env,
					PI_SELF_UPDATE_COMMAND: "unexpected-updater",
				},
				updateCheck: fixture.sources,
				script: { replies: [] },
			});
			await piu.mockInput.typeText("/update");
			piu.mockInput.pressEnter();
			await piu.waitForFrame(
				(f) => f.includes("custom") && f.includes("self-update command"),
			);
			expect(fixture.calls()).toHaveLength(0);
			expect(piu.exits).toHaveLength(0);
		} finally {
			fixture.cleanup();
		}
	});
}

test("a network failure installs nothing and a later /update can retry", async () => {
	const fixture = updateFixture("pi", "npm");
	let online = false;
	const sources = releaseSources({
		[piLatestUrl]: () =>
			online
				? json({ version: "1.0.1" })
				: new TypeError("fixture network unavailable"),
	});
	try {
		await using piu = await startPiu({
			backendCommand: fixture.command,
			appEnv: fixture.env,
			updateCheck: sources,
			script: { replies: [] },
		});
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("fixture network unavailable"));
		expect(fixture.calls()).toHaveLength(0);
		expect(piu.exits).toHaveLength(0);
		online = true;
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await eventually(
			() => piu.exits[0],
			"the retry after the network recovers",
		);
		expect(fixture.calls()).toHaveLength(1);
	} finally {
		fixture.cleanup();
	}
});

test("an unrecognized installation is refused without invoking any installer", async () => {
	const fixture = updateFixture("pi", "npm");
	rmSync(
		join(
			fixture.root,
			"lib/node_modules/@earendil-works/pi-coding-agent/package.json",
		),
	);
	try {
		await using piu = await startPiu({
			backendCommand: fixture.command,
			appEnv: fixture.env,
			updateCheck: fixture.sources,
			script: { replies: [] },
		});
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Cannot determine how to update"));
		expect(fixture.calls()).toHaveLength(0);
		expect(piu.exits).toHaveLength(0);
	} finally {
		fixture.cleanup();
	}
});

test("a Bun project dependency is not converted to a global installation by /update", async () => {
	const fixture = updateFixture("pi", "bun");
	const localBin = join(fixture.root, "node_modules/.bin/pi");
	mkdirSync(join(fixture.root, "node_modules/.bin"));
	symlinkSync(fixture.file, localBin);
	try {
		await using piu = await startPiu({
			backendCommand: localBin,
			appEnv: fixture.env,
			updateCheck: fixture.sources,
			script: { replies: [] },
		});
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("global Bun installation"));
		expect(fixture.calls()).toHaveLength(0);
		expect(piu.exits).toHaveLength(0);
	} finally {
		fixture.cleanup();
	}
});

for (const agentDir of ["~/.pi/agent", "relative-agent", "file-url"]) {
	test(`${agentDir}: a curl updater reads the same custom-update settings as its Backend`, async () => {
		const fixture = updateFixture("pi-bolt", "curl");
		const actual = join(
			fixture.dir,
			agentDir === "relative-agent" ? agentDir : ".pi/agent",
		);
		mkdirSync(actual, { recursive: true });
		writeFileSync(
			join(actual, "settings.json"),
			JSON.stringify({ selfUpdateCommand: ["unexpected-updater"] }),
		);
		try {
			await using piu = await startPiu({
				cwd: fixture.dir,
				backendCommand: fixture.command,
				appEnv: fixture.env,
				backendEnv: {
					HOME: fixture.dir,
					PI_CODING_AGENT_DIR:
						agentDir === "file-url"
							? new URL(`file://${actual}`).href
							: agentDir,
				},
				updateCheck: fixture.sources,
				script: { replies: [] },
			});
			await piu.mockInput.typeText("/update");
			piu.mockInput.pressEnter();
			await piu.waitForFrame((f) => f.includes("self-update command"));
			expect(fixture.calls()).toHaveLength(0);
		} finally {
			fixture.cleanup();
		}
	});
}

test("/update is offered in slash autocomplete and does not queue a prompt while the Backend is working", async () => {
	const fixture = updateFixture("pi", "npm");
	const sources = releaseSources({ [piLatestUrl]: json({ version: "1.0.0" }) });
	try {
		await using piu = await startPiu({
			backendCommand: fixture.command,
			appEnv: fixture.env,
			updateCheck: sources,
			script: {
				replies: [
					{
						toolCalls: [
							{
								name: "bash",
								args: {
									command: `while [ -d '${fixture.dir}' ] && [ ! -e '${join(fixture.dir, "release")}' ]; do sleep 0.05; done`,
								},
							},
						],
					},
					"Finished original work",
					"{lastUser} has {messages}",
				],
			},
		});
		await piu.mockInput.typeText("/up");
		await piu.waitForFrame((f) => f.includes("/update"));
		piu.mockInput.pressEscape();
		piu.mockInput.pressKey("\x15");
		await piu.mockInput.typeText("work");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("running"));
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("already up to date"));
		writeFileSync(join(fixture.dir, "release"), "");
		await piu.waitForFrame((f) => f.includes("Finished original work"));
		await piu.mockInput.typeText("follow-up");
		piu.mockInput.pressEnter();
		const frame = await piu.waitForFrame((f) =>
			f.includes('"follow-up" has 4'),
		);
		expect(frame).not.toContain("> /update");
		expect(fixture.calls()).toHaveLength(0);
	} finally {
		fixture.cleanup();
	}
});

test("a changed executable realpath still shows the installed changelog on restart", async () => {
	const fixture = updateFixture("pi", "npm", { rotate: true });
	try {
		{
			await using piu = await startPiu({
				dir: fixture.dir,
				backendCommand: fixture.command,
				appEnv: fixture.env,
				updateCheck: fixture.sources,
				script: { replies: [] },
			});
			await piu.mockInput.typeText("/update");
			piu.mockInput.pressEnter();
			await eventually(
				() => piu.exits[0],
				"the restart after replacing the executable",
			);
		}
		await using restarted = await startPiu({
			dir: fixture.dir,
			backendCommand: fixture.command,
			appEnv: fixture.env,
			updateCheck: fixture.sources,
			script: { replies: [] },
		});
		const frame = await restarted.waitForFrame((f) =>
			f.includes("Verified update note"),
		);
		expect(frame).toContain("1.0.0 → 1.0.1");
	} finally {
		fixture.cleanup();
	}
});

test("the updating instance sees its changelog even if a neighbor has already marked that release as seen", async () => {
	const fixture = updateFixture("pi", "npm");
	const appEnv = {
		...fixture.env,
		PIU_HANDOFF: join(fixture.dir, "handoff.json"),
	};
	try {
		{
			await using piu = await startPiu({
				dir: fixture.dir,
				backendCommand: fixture.command,
				appEnv,
				updateCheck: fixture.sources,
				script: { replies: [] },
			});
			await piu.mockInput.typeText("/update");
			piu.mockInput.pressEnter();
			await eventually(() => piu.exits[0], "the update restart");
		}
		const storeFile = join(fixture.dir, "backend-versions.json");
		const seen = JSON.parse(readFileSync(storeFile, "utf8"));
		for (const key of Object.keys(seen)) seen[key] = "1.0.1";
		writeFileSync(storeFile, JSON.stringify(seen));
		await using restarted = await startPiu({
			dir: fixture.dir,
			backendCommand: fixture.command,
			appEnv,
			updateCheck: fixture.sources,
			script: { replies: [] },
		});
		const frame = await restarted.waitForFrame((f) =>
			f.includes("Verified update note"),
		);
		expect(frame).toContain("1.0.0 → 1.0.1");
	} finally {
		fixture.cleanup();
	}
});

for (const outcome of ["failure", "unchanged", "wrong-family", "lower"]) {
	test(`${outcome}: an unsuccessful installer does not restart piu`, async () => {
		const fixture = updateFixture("pi", "npm");
		fixture.setOutcome(outcome);
		try {
			await using piu = await startPiu({
				backendCommand: fixture.command,
				appEnv: fixture.env,
				updateCheck: fixture.sources,
				script: { replies: ["Still usable"] },
			});
			await piu.mockInput.typeText("/update");
			piu.mockInput.pressEnter();
			await piu.waitForFrame((f) =>
				f.includes(
					outcome === "failure"
						? "permission denied"
						: "target Backend version",
				),
			);
			expect(piu.exits).toHaveLength(0);
			await piu.mockInput.typeText("ordinary prompt");
			piu.mockInput.pressEnter();
			await piu.waitForFrame((f) => f.includes("Still usable"));
			expect(fixture.calls()).toHaveLength(1);
		} finally {
			fixture.cleanup();
		}
	});
}

test("/update reports an up-to-date Backend without sending it to the model", async () => {
	const root = mkdtempSync(join(tmpdir(), "piu-update-"));
	try {
		const install = fakeInstall(root, "pi", "npm", "1.5.2");
		const sources = releaseSources({
			[piLatestUrl]: json({ version: "1.5.2" }),
		});
		await using piu = await startPiu({
			backendCommand: install.command,
			updateCheck: sources,
			script: { replies: ["{lastUser} has {messages}"] },
		});
		await sources.called(piLatestUrl);
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("already up to date"));
		await piu.mockInput.typeText("real-prompt");
		piu.mockInput.pressEnter();
		const frame = await piu.waitForFrame((f) =>
			f.includes('"real-prompt" has 1'),
		);
		expect(frame).not.toContain("> /update");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a repeated /update reports the running check and leaves the interface responsive", async () => {
	const root = mkdtempSync(join(tmpdir(), "piu-update-"));
	let release: ((response: Response) => void) | undefined;
	try {
		const install = fakeInstall(root, "pi", "npm", "1.5.2");
		let calls = 0;
		const sources = releaseSources({
			[piLatestUrl]: () => {
				calls++;
				if (calls === 1) return json({ version: "1.5.2" });
				return new Promise<Response>((resolve) => {
					release = resolve;
				});
			},
		});
		await using piu = await startPiu({
			backendCommand: install.command,
			updateCheck: sources,
			script: { replies: [] },
		});
		await sources.called(piLatestUrl);
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Checking Pi"));
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("already running"));
		expect(calls).toBe(2);
	} finally {
		release?.(json({ version: "1.5.2" }));
		rmSync(root, { recursive: true, force: true });
	}
});

test("/update without release sources reports that release checks are off instead of reaching the network", async () => {
	const fixture = updateFixture("pi", "npm");
	const realFetch = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = Object.assign(
		async (input: string | URL | Request) => {
			requested.push(String(input));
			throw new Error("network");
		},
		{ preconnect: realFetch.preconnect },
	);
	try {
		await using piu = await startPiu({
			backendCommand: fixture.command,
			appEnv: fixture.env,
			script: { replies: [] },
		});
		await piu.waitForFrame((f) => f.includes("faux-1"));
		await piu.mockInput.typeText("/update");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) =>
			f.includes("Release checks are switched off"),
		);
		expect(requested).toEqual([]);
		expect(fixture.calls()).toHaveLength(0);
	} finally {
		globalThis.fetch = realFetch;
		fixture.cleanup();
	}
});
