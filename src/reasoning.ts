import type { CommandContext } from "./module.ts";
import type { ThinkingLevel } from "./pi-state.ts";
import { openPicker, type PickerOptions } from "./picker.tsx";

export function reasoningPicker(
	context: CommandContext,
): PickerOptions<ThinkingLevel> {
	return {
		id: "reasoning-picker",
		width: 30,
		items: () =>
			context.pi.thinkingLevels.map((level) => ({
				label: level,
				value: level,
			})),
		selected: () => context.pi.thinkingLevels.indexOf(context.pi.thinkingLevel),
		onPick: (level) => void context.actions.setThinkingLevel(level),
	};
}

export function openReasoningPicker(context: CommandContext) {
	openPicker(context, reasoningPicker(context));
}
