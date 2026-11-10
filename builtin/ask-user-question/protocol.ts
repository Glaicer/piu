import { channelTitle } from "../../src/channel.ts";

export const CHANNEL = "ask";
export const CHANNEL_TITLE = channelTitle("ask-user-question", CHANNEL);

export type Question = {
	readonly question: string;
	readonly header: string;
	readonly options: readonly {
		readonly label: string;
		readonly description?: string;
	}[];
	readonly multiSelect?: boolean;
};

export type Request = {
	readonly v: 1;
	readonly questions: readonly Question[];
};

export type Reply = { readonly answers: readonly (readonly string[])[] };
