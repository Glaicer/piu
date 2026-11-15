import {
	type ClipboardService,
	type CliRenderer,
	createClipboard,
	createHostClipboard,
	createRendererClipboardAdapter,
} from "@opentui/core";
import { useSelectionHandler } from "@opentui/solid";
import { onCleanup } from "solid-js";
import type { ToastKind } from "./toast.tsx";

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
	useSelectionHandler(async (selection) => {
		const text = selection.getSelectedText();
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
	});
}
