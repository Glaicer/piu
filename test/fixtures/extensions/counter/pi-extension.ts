import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("counter-ping", {
		description: "Ping from the counter Extension",
		handler: async () => {},
	});
}
