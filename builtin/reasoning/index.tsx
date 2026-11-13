import type { Extension } from "../../src/module.ts";
import { PickerButton } from "../../src/picker.tsx";
import { reasoningPicker } from "../../src/reasoning.ts";

// why: the /reasoning command lives in the model Extension so it stays available when this optional Module is not placed.
export default {
	modules: [
		{
			id: "level",
			render: (context) => (
				<PickerButton
					context={context}
					label={`Reasoning: ${context.pi.thinkingLevel}`}
					picker={reasoningPicker(context)}
				/>
			),
		},
	],
} satisfies Extension;
