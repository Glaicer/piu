import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

type ReadJson = {
	value?: unknown;
	error?: string;
};

export function readJson(file: string): ReadJson {
	try {
		return { value: JSON.parse(readFileSync(file, "utf8")) };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		return { error: String(error) };
	}
}

export function writeJson(file: string, value: unknown) {
	mkdirSync(dirname(file), { recursive: true });
	const temp = `${file}.${crypto.randomUUID()}.tmp`;
	try {
		writeFileSync(temp, JSON.stringify(value));
		renameSync(temp, file);
	} catch (error) {
		rmSync(temp, { force: true });
		throw error;
	}
}
