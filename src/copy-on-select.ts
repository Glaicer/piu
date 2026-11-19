import {
	type ClipboardReadResult,
	type ClipboardService,
	type CliRenderer,
	createClipboard,
	createHostClipboard,
	createRendererClipboardAdapter,
} from "@opentui/core";
import { useSelectionHandler } from "@opentui/solid";
import { onCleanup } from "solid-js";
import type { ToastKind } from "./toast.tsx";

async function readMacFiles(): Promise<ClipboardReadResult | undefined> {
	try {
		const child = Bun.spawn(
			[
				"/usr/bin/osascript",
				"-l",
				"JavaScript",
				"-e",
				`ObjC.import("AppKit");
			const urls = $.NSPasteboard.generalPasteboard.readObjectsForClassesOptions(
				[$.NSURL], $({ NSPasteboardURLReadingFileURLsOnlyKey: true }));
			const paths = [];
			for (let i = 0; i < urls.count; i++) paths.push(ObjC.unwrap(urls.objectAtIndex(i).absoluteString));
			paths.join("\\n");`,
			],
			{ stdout: "pipe", stderr: "ignore", signal: AbortSignal.timeout(2_000) },
		);
		const paths = (await new Response(child.stdout).text()).trim();
		if ((await child.exited) || !paths) return;
		return {
			status: "read",
			representation: {
				mimeType: "text/uri-list",
				bytes: new TextEncoder().encode(paths),
			},
		};
	} catch {
		return undefined;
	}
}

export function useCopyOnSelect(
	renderer: CliRenderer,
	injected: ClipboardService | undefined,
	notify: (message: string, kind: ToastKind) => void,
) {
	const clipboard =
		injected ??
		createClipboard({
			host: createHostClipboard(),
			terminal: createRendererClipboardAdapter(renderer),
		});
	onCleanup(() => void clipboard.dispose());
	async function copy(text: string) {
		// why: a plain click starts and finishes a selection of no text, and writeText rejects an empty string.
		if (!text) return;
		try {
			const { host, terminal } = await clipboard.writeText(text, {
				destination: "best-available",
			});
			if (host.status !== "written" && terminal.status !== "attempted") {
				notify("Could not copy the selection", "error");
			} else {
				notify("Copied to clipboard", "info");
			}
		} catch {
			notify("Could not copy the selection", "error");
		}
	}
	useSelectionHandler((selection) => void copy(selection.getSelectedText()));
	return {
		copy,
		async read() {
			if (!injected && process.platform === "darwin") {
				const files = await readMacFiles();
				if (files) return files;
			}
			return clipboard.read({
				preferredTypes: [
					"image/png",
					"image/jpeg",
					"image/gif",
					"image/webp",
					"text/plain",
				],
			});
		},
	};
}
