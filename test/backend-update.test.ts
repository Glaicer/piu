import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type Family,
	fakeInstall,
	families,
	type Manager,
	managers,
} from "./backend-install.ts";
import { startPiu } from "./harness.ts";
import {
	json,
	piBoltLatestUrl,
	piLatestUrl,
	releaseSources,
} from "./releases.ts";

const name = { pi: "Pi", "pi-bolt": "Pi-Bolt" };
const firstVersion = { pi: "1.5.0", "pi-bolt": "1.2.1" };
const newerVersion = { pi: "1.6.0", "pi-bolt": "1.3.0" };

function latestRoute(
	family: Family,
	version: string,
): Record<string, Response> {
	return family === "pi"
		? { [piLatestUrl]: json({ ok: true, version, packageName: "pi" }) }
		: { [piBoltLatestUrl]: json({ tag_name: `bolt-v${version}` }) };
}

function latestUrl(family: Family) {
	return family === "pi" ? piLatestUrl : piBoltLatestUrl;
}

function tmp<T>(use: (root: string) => Promise<T>) {
	const root = mkdtempSync(join(tmpdir(), "piu-install-"));
	return use(root).finally(() =>
		rmSync(root, { recursive: true, force: true }),
	);
}

const none = { replies: [] };

for (const family of families) {
	for (const manager of managers) {
		test(`${name[family]} installed by ${manager}: an available update shows the Backend, both versions and /update`, () =>
			tmp(async (root) => {
				const install = fakeInstall(
					root,
					family,
					manager,
					firstVersion[family],
				);
				const sources = releaseSources(
					latestRoute(family, newerVersion[family]),
				);
				await using piu = await startPiu({
					script: none,
					backendCommand: install.command,
					updateCheck: sources,
				});

				const frame = await piu.waitForFrame((f) => f.includes("/update"));

				expect(frame).toContain(
					`${name[family]} update available: ${firstVersion[family]} → ${newerVersion[family]}`,
				);
				expect(sources.calls).toEqual([latestUrl(family)]);
			}));
	}
}

async function expectNoNotice(
	family: Family,
	routes: Parameters<typeof releaseSources>[0],
	manager: Manager = "npm",
) {
	await tmp(async (root) => {
		const install = fakeInstall(root, family, manager, firstVersion[family]);
		const sources = releaseSources(routes);
		await using piu = await startPiu({
			script: { replies: ["Still working"] },
			backendCommand: install.command,
			updateCheck: sources,
		});
		await sources.called(latestUrl(family));
		await piu.mockInput.typeText("Hello");
		piu.mockInput.pressEnter();
		const frame = await piu.waitForFrame((f) => f.includes("Still working"));
		expect(frame).not.toContain("update available");
	});
}

for (const family of families) {
	test(`${name[family]} at the latest version shows no update message`, () =>
		expectNoNotice(family, latestRoute(family, firstVersion[family])));

	test(`${name[family]} ahead of the published latest shows no update message`, () =>
		expectNoNotice(family, latestRoute(family, "0.0.1")));

	test(`${name[family]}: a network error does not block the app or show a message`, () =>
		expectNoNotice(family, { [latestUrl(family)]: new TypeError("offline") }));

	test(`${name[family]}: an HTTP error is not an update`, () =>
		expectNoNotice(family, {
			[latestUrl(family)]: json(
				family === "pi"
					? { version: newerVersion.pi }
					: { tag_name: `bolt-v${newerVersion["pi-bolt"]}` },
				403,
			),
		}));

	test(`${name[family]}: a reply without a version is not an update`, () =>
		expectNoNotice(family, { [latestUrl(family)]: json({ ok: true }) }));
}

test("Pi-Bolt is compared with Pi-Bolt releases, not with the Pi it is built on", () =>
	tmp(async (root) => {
		const install = fakeInstall(root, "pi-bolt", "npm", "1.2.1");
		const sources = releaseSources({
			// why: 1.5.2 is the Pi inside the stand-in's version line; the release list must never be read as Pi's.
			[piBoltLatestUrl]: json({ tag_name: "bolt-v1.2.1" }),
			[piLatestUrl]: json({ version: "9.9.9" }),
		});
		await using piu = await startPiu({
			script: { replies: ["Done"] },
			backendCommand: install.command,
			updateCheck: sources,
		});
		await sources.called(piBoltLatestUrl);
		await piu.mockInput.typeText("Hello");
		piu.mockInput.pressEnter();

		const frame = await piu.waitForFrame((f) => f.includes("Done"));

		expect(frame).not.toContain("update available");
		expect(sources.calls).toEqual([piBoltLatestUrl]);
	}));

test("the check does not wait for the network: a prompt is answered while the release source is still silent", () =>
	tmp(async (root) => {
		const install = fakeInstall(root, "pi", "npm", "1.5.0");
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const sources = releaseSources({
			[piLatestUrl]: async () => {
				await held;
				return json({ version: "1.6.0" });
			},
		});
		await using piu = await startPiu({
			script: { replies: ["Answered at once"] },
			backendCommand: install.command,
			updateCheck: sources,
		});
		await sources.called(piLatestUrl);

		await piu.mockInput.typeText("Hello");
		piu.mockInput.pressEnter();
		const answered = await piu.waitForFrame((f) =>
			f.includes("Answered at once"),
		);
		expect(answered).not.toContain("update available");

		release();
		await piu.waitForFrame((f) => f.includes("1.5.0 → 1.6.0"));
	}));

test("closing piu cancels a check that is still waiting for the network", () =>
	tmp(async (root) => {
		const install = fakeInstall(root, "pi", "npm", "1.5.0");
		const sources = releaseSources({
			[piLatestUrl]: () => new Promise(() => {}),
		});
		{
			await using _ = await startPiu({
				script: none,
				backendCommand: install.command,
				updateCheck: sources,
			});
			await sources.called(piLatestUrl);
			expect(sources.signals.some((signal) => signal.aborted)).toBe(false);
		}

		expect(sources.signals.every((signal) => signal.aborted)).toBe(true);
	}));

for (const variable of ["PI_OFFLINE", "PI_SKIP_VERSION_CHECK"]) {
	test(`${variable} keeps the check off the network`, () =>
		tmp(async (root) => {
			const install = fakeInstall(root, "pi", "npm", "1.5.0");
			const sources = releaseSources(latestRoute("pi", "1.6.0"));
			const saved = process.env[variable];
			process.env[variable] = "1";
			try {
				await using piu = await startPiu({
					script: { replies: ["Done"] },
					backendCommand: install.command,
					updateCheck: sources,
				});
				await piu.mockInput.typeText("Hello");
				piu.mockInput.pressEnter();
				await piu.waitForFrame((f) => f.includes("Done"));
				await Bun.sleep(300);
				expect(sources.calls).toEqual([]);
			} finally {
				if (saved === undefined) delete process.env[variable];
				else process.env[variable] = saved;
			}
		}));
}

test("a Backend that does not print a Pi version is not checked", () =>
	tmp(async (root) => {
		const stranger = join(root, "stranger");
		mkdirSync(root, { recursive: true });
		await Bun.write(
			stranger,
			'#!/bin/sh\nfor last; do :; done\n[ "$last" = "--version" ] && { echo "tool 3"; exit 0; }\nexec env "$@"\n',
		);
		await Bun.$`chmod +x ${stranger}`;
		const sources = releaseSources(latestRoute("pi", "9.9.9"));
		await using piu = await startPiu({
			script: { replies: ["Done"] },
			backendCommand: stranger,
			updateCheck: sources,
		});
		await piu.mockInput.typeText("Hello");
		piu.mockInput.pressEnter();
		await piu.waitForFrame((f) => f.includes("Done"));
		await Bun.sleep(300);
		expect(sources.calls).toEqual([]);
	}));
