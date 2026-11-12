import {
	type ClipboardService,
	type CliRenderer,
	createClipboard,
	createHostClipboard,
	createRendererClipboardAdapter,
} from "@opentui/core";
import { useSelectionHandler } from "@opentui/solid";
import { onCleanup } from "solid-js";

export function useCopyOnSelect(
	renderer: CliRenderer,
	injected: ClipboardService | undefined,
	fail: (message: string) => void,
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
				fail("Could not copy the selection");
			}
		} catch {
			fail("Could not copy the selection");
		}
	});
}
