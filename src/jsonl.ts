import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

// shortcut: copy of Pi 1.5.0 `modes/rpc/jsonl.ts` (ADR-0001); import it instead once Pi exports it.
export function attachJsonlLineReader(
	stream: Readable,
	onLine: (line: string) => void,
): () => void {
	const decoder = new StringDecoder("utf8");
	let buffer = "";
	const emitLine = (line: string) => {
		onLine(line.endsWith("\r") ? line.slice(0, -1) : line);
	};
	const onData = (chunk: Buffer | string) => {
		buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
		while (true) {
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) return;
			emitLine(buffer.slice(0, newlineIndex));
			buffer = buffer.slice(newlineIndex + 1);
		}
	};
	const onEnd = () => {
		buffer += decoder.end();
		if (buffer.length > 0) {
			emitLine(buffer);
			buffer = "";
		}
	};
	stream.on("data", onData);
	stream.on("end", onEnd);
	return () => {
		stream.off("data", onData);
		stream.off("end", onEnd);
	};
}

export function serializeJsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}
