import type { Extension } from "../../src/module.ts";
import { PickerButton } from "../../src/picker.tsx";

export default {
	modules: [
		{
			id: "level",
			render: (context) => (
				<PickerButton
					context={context}
					id="reasoning-picker"
					label={`Reasoning: ${context.pi.thinkingLevel}`}
					width={30}
					items={() =>
						context.pi.thinkingLevels.map((level) => ({
							label: level,
							value: level,
						}))
					}
					selected={() =>
						context.pi.thinkingLevels.indexOf(context.pi.thinkingLevel)
					}
					onPick={(level) => void context.actions.setThinkingLevel(level)}
				/>
			),
		},
	],
} satisfies Extension;
