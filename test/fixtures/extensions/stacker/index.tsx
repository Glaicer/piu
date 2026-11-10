import { moduleModal } from "../../../../src/modal.tsx";
import type { Extension } from "../../../../src/module.ts";

function inner() {
	return moduleModal(
		{
			id: "inner",
			render: (ctx) => <text fg={ctx.theme.text}>INNER</text>,
		},
		{ width: 20, height: 3, left: 4, top: 2 },
	);
}

export default {
	modules: [
		{
			id: "opener",
			render: (context) => (
				<box
					onMouseDown={(event) => {
						event.preventDefault();
						context.actions.openModal(
							moduleModal(
								{
									id: "outer",
									render: (ctx) => (
										<box
											flexDirection="column"
											onMouseDown={(e) => {
												e.preventDefault();
												ctx.actions.openModal(inner());
											}}
										>
											<text fg={ctx.theme.text}>OUTER</text>
											<text fg={ctx.theme.text}>open inner</text>
										</box>
									),
								},
								{ width: 40, height: 6 },
							),
						);
					}}
				>
					<text fg={context.theme.text}> open outer </text>
				</box>
			),
		},
	],
} satisfies Extension;
