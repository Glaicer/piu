import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, resolve } from "node:path";

function isExecutable(path: string) {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function commandPath(
	command: string,
	cwd: string,
	pathVar: string | undefined,
) {
	const candidates = command.includes("/")
		? [resolve(cwd, command)]
		: (pathVar ?? "")
				.split(delimiter)
				.filter(Boolean)
				.map((dir) => resolve(cwd, dir, command));
	return candidates.find(isExecutable);
}

export function resolveCommand(
	command: string,
	cwd: string,
	pathVar: string | undefined,
) {
	const file = commandPath(command, cwd, pathVar);
	return file && realpathSync(file);
}
