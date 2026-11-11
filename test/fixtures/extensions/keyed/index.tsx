import type { Extension } from "../../../../src/module.ts";

export default {
	modules: [
		{
			id: "pad",
			render: (context) => {
				context.onKey(() => {});
				return <text>Keyed</text>;
			},
		},
	],
} satisfies Extension;
