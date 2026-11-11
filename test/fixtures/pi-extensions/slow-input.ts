import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("input", async () => {
		await new Promise((resolve) => setTimeout(resolve, 600));
	});
}
