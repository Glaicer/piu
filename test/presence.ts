import { createSignal } from "solid-js";
import type { Presence } from "../src/module.ts";

export const [note, setNote] = createSignal<Presence>("hidden");
export const [takeover, setTakeover] = createSignal<Presence>("hidden");
