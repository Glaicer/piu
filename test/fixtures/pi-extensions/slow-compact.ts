import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_before_compact", async () => {
		await new Promise((resolve) => setTimeout(resolve, 1500));
	});
}
