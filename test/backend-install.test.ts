import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { detectInstall, parseVersionOutput } from "../src/backend-install.ts";
import { fakeInstall, families, managers } from "./backend-install.ts";

const systemPath = { PATH: process.env.PATH };

function withRoot<T>(use: (root: string) => Promise<T>) {
	const root = mkdtempSync(join(tmpdir(), "piu-detect-"));
	return use(root).finally(() =>
		rmSync(root, { recursive: true, force: true }),
	);
}

test("Pi-Bolt's version line gives the Pi-Bolt version, not the Pi inside it", () => {
	expect(
		parseVersionOutput("1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off)\n"),
	).toEqual({ family: "pi-bolt", version: "1.2.1" });
});

test("stock Pi's bare version line gives stock Pi", () => {
	expect(parseVersionOutput("1.5.0\n")).toEqual({
		family: "pi",
		version: "1.5.0",
	});
});

test("anything else is no known Backend", () => {
	expect(parseVersionOutput("tool 3\n")).toBeUndefined();
	expect(parseVersionOutput("")).toBeUndefined();
});

for (const family of families) {
	for (const manager of managers) {
		test(`${family} installed by ${manager}: the install is found by the configured command`, () =>
			withRoot(async (root) => {
				const install = fakeInstall(root, family, manager, "2.3.4");

				const found = await detectInstall(
					{ command: install.command, args: [] },
					{ cwd: root, env: systemPath },
				);

				expect(found).toMatchObject({ family, version: "2.3.4" });
			}));
	}
}

test("a bare command name is looked up on PATH in order, and only the configured name counts", () =>
	withRoot(async (root) => {
		const wanted = fakeInstall(join(root, "a"), "pi-bolt", "curl", "1.2.1");
		const decoy = fakeInstall(join(root, "b"), "pi-bolt", "npm", "9.9.9");
		const stockPi = fakeInstall(join(root, "c"), "pi", "pnpm", "1.5.0");
		const env = {
			PATH: [
				dirname(wanted.command),
				dirname(decoy.command),
				dirname(stockPi.command),
				process.env.PATH,
			].join(delimiter),
		};

		const found = await detectInstall(
			{ command: "pi-bolt", args: [] },
			{ cwd: root, env },
		);

		expect(found).toEqual({
			family: "pi-bolt",
			version: "1.2.1",
			id: `pi-bolt:${wanted.file}`,
		});
	}));

test("a Backend started through a wrapper command and its arguments is probed the same way", () =>
	withRoot(async (root) => {
		const install = fakeInstall(root, "pi-bolt", "npm", "1.2.1");

		const found = await detectInstall(
			{ command: "env", args: ["PI_OFFLINE=1", install.command] },
			{ cwd: root, env: systemPath },
		);

		expect(found).toMatchObject({ family: "pi-bolt", version: "1.2.1" });
	}));

test("two installs of one family have different ids", () =>
	withRoot(async (root) => {
		const one = fakeInstall(join(root, "a"), "pi", "npm", "1.5.0");
		const two = fakeInstall(join(root, "b"), "pi", "npm", "1.5.0");
		const options = { cwd: root, env: systemPath };

		const [first, second] = await Promise.all([
			detectInstall({ command: one.command, args: [] }, options),
			detectInstall({ command: two.command, args: [] }, options),
		]);

		expect(first?.id).not.toBe(second?.id);
	}));

test("a command that does not exist is no install", () =>
	withRoot(async (root) => {
		expect(
			await detectInstall(
				{ command: "piu-no-such-backend", args: [] },
				{ cwd: root, env: { PATH: `${root}${delimiter}${process.env.PATH}` } },
			),
		).toBeUndefined();
	}));

test("a relative command path is resolved against the working directory", () =>
	withRoot(async (root) => {
		const install = fakeInstall(root, "pi", "bun", "1.5.0");

		const found = await detectInstall(
			{ command: "./bun/bin/pi", args: [] },
			{ cwd: root, env: systemPath },
		);

		expect(found?.id).toBe(`pi:${install.file}`);
	}));
