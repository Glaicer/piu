import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// why: stands in for a provider whose catalog arrives after Pi starts (the author's commandcode extension refreshes its model list over the network); the models are missing from `set_model` until then.
export default function (pi: ExtensionAPI) {
	setTimeout(() => {
		pi.registerProvider("late", {
			name: "Late",
			baseUrl: "http://127.0.0.1:1/v1",
			apiKey: "late",
			api: "openai-completions",
			models: [
				{
					id: "late-1",
					name: "Late 1",
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 8000,
					maxTokens: 1000,
					reasoning: false,
				},
			],
		});
	}, 1500);
}
