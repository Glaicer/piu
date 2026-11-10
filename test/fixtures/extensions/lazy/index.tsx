import type { Extension } from "../../../../src/module.ts";
import { loaded } from "../../../loaded.ts";

loaded.push("lazy");

export default {
	modules: [{ id: "idle", render: () => <text>Idle</text> }],
} satisfies Extension;
