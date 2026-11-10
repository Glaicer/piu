import type { CommandContext, Extension } from "../../src/module.ts";
import type { ThinkingLevel } from "../../src/pi-state.ts";
import {
	openPicker,
	PickerButton,
	type PickerOptions,
} from "../../src/picker.tsx";

const levelPicker = (
	context: CommandContext,
): PickerOptions<ThinkingLevel> => ({
	id: "reasoning-picker",
	width: 30,
	items: () =>
		context.pi.thinkingLevels.map((level) => ({ label: level, value: level })),
	selected: () => context.pi.thinkingLevels.indexOf(context.pi.thinkingLevel),
	onPick: (level) => void context.actions.setThinkingLevel(level),
});

export default {
	modules: [
		{
			id: "level",
			render: (context) => (
				<PickerButton
					context={context}
					label={`Reasoning: ${context.pi.thinkingLevel}`}
					picker={levelPicker(context)}
				/>
			),
		},
	],
	commands: [
		{
			name: "reasoning",
			description: "Set the reasoning level",
			run: (context) => openPicker(context, levelPicker(context)),
		},
	],
} satisfies Extension;
