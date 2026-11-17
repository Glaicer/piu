import type {
	Api,
	AssistantMessage,
	Message,
	Model,
	SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
	convertToLlm,
	type ExtensionAPI,
	type ExtensionContext,
	type ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import {
	BTW_CHANNEL_TITLE,
	BTW_DESCRIPTION,
	BTW_STATUS_KEY,
	type BtwPending,
	type BtwThread,
	parseBtwReply,
	serializeBtwThread,
} from "../../src/btw.ts";

type StreamSimple = NonNullable<ProviderConfig["streamSimple"]>;
type OnPayload = NonNullable<SimpleStreamOptions["onPayload"]>;

type MainRequest = {
	model: Model<Api>;
	messages: Message[];
	options: SimpleStreamOptions;
	sessionId: string;
};

type Exchange = { question: string; answer: AssistantMessage };

type SideThread = {
	exchanges: Exchange[];
	pending?: BtwPending;
	controller?: AbortController;
	streaming: boolean;
	model: string;
	ended: boolean;
	end(): void;
};

const NO_MODEL = "No model selected.";
const PUBLISH_MS = 50;

// why: the tools and tool_choice stay as the main request had them, or the prompt cache prefix breaks; the sentence tells the model not to call them.
const sideQuestion = (question: string) =>
	`${question}\n\n(Side question: answer in text from the conversation so far. Tools are unavailable here, so do not call any.)`;

const textOf = (message: AssistantMessage) =>
	message.content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("\n")
		.trim();

const threadMessages = (thread: Exchange[]): Message[] =>
	thread.flatMap(({ question, answer }) => [
		{
			role: "user" as const,
			content: sideQuestion(question),
			timestamp: answer.timestamp,
		},
		answer,
	]);

const sideState = (side: SideThread): BtwThread => ({
	model: side.model,
	streaming: side.streaming,
	thread: side.exchanges.map(({ question, answer }, n) => ({
		n,
		question,
		answer: textOf(answer),
	})),
	...(side.pending ? { pending: side.pending } : {}),
});

export default function btw(pi: ExtensionAPI): void {
	let latest: MainRequest | undefined;
	let latestMessages: readonly Message[] | undefined;
	let activeSession: string | undefined;
	let openSide: SideThread | undefined;
	const wrapped = new WeakSet<StreamSimple>();
	// why: the wrapper must not record the side request as the main one, and a side request reuses the recorded onPayload hook.
	const sideCallbacks = new WeakSet<OnPayload>();

	const forget = (_event: unknown, ctx: ExtensionContext) => {
		openSide?.end();
		latest = undefined;
		latestMessages = undefined;
		activeSession = ctx.sessionManager.getSessionId();
	};
	// why: without a recorded request (right after resume) the prefix is rebuilt from the branch, so the first side question may miss the cache and other extensions' context hooks.
	const fromSession = (ctx: ExtensionContext): MainRequest | undefined => {
		if (!ctx.model) return undefined;
		const sessionId = ctx.sessionManager.getSessionId();
		const level = pi.getThinkingLevel();
		return {
			model: ctx.model,
			messages: convertToLlm(
				ctx.sessionManager.buildSessionProjection().messages,
			),
			options: { sessionId, reasoning: level === "off" ? undefined : level },
			sessionId,
		};
	};

	const recorded = (ctx: ExtensionContext): MainRequest | undefined =>
		latest?.sessionId === ctx.sessionManager.getSessionId()
			? latest
			: fromSession(ctx);

	pi.on("session_start", forget);
	pi.on("session_tree", forget);
	pi.on("session_compact", forget);
	pi.on("session_shutdown", () => openSide?.end());

	pi.on("before_agent_start", (_event, ctx) => {
		const model = ctx.model;
		if (!model) return;
		const id = model.provider;
		const native = ctx.modelRegistry.getRegisteredNativeProvider(id);
		const registration = ctx.modelRegistry.getRegisteredProviderConfig(id);
		if (native && wrapped.has(native.streamSimple)) return;
		if (
			registration?.streamSimple &&
			registration.api === model.api &&
			wrapped.has(registration.streamSimple)
		)
			return;
		const provider = native ?? ctx.modelRegistry.getProvider(id);
		if (!provider) return;
		const decorated: StreamSimple = (model, context, options) => {
			// why: another session id is compaction or a summary, and the same array again is the cache warmer.
			if (
				options &&
				activeSession &&
				options.sessionId === activeSession &&
				!(options.onPayload && sideCallbacks.has(options.onPayload)) &&
				context.messages !== latestMessages
			) {
				const {
					signal: _signal,
					apiKey: _apiKey,
					headers: _headers,
					env: _env,
					onResponse: _onResponse,
					onProviderStreamEvent: _onProviderStreamEvent,
					...rest
				} = options;
				latestMessages = context.messages;
				latest = {
					model: structuredClone(model),
					messages: [...context.messages],
					options: rest,
					sessionId: activeSession,
				};
			}
			return provider.streamSimple(model, context, options);
		};
		wrapped.add(decorated);
		if (native) pi.registerProvider({ ...native, streamSimple: decorated });
		else pi.registerProvider(id, { api: model.api, streamSimple: decorated });
	});

	async function ask(
		side: SideThread,
		question: string,
		ctx: ExtensionContext,
		publish: () => void,
	) {
		const pending: BtwPending = { question, text: "" };
		side.pending = pending;
		side.streaming = true;
		const main = recorded(ctx);
		if (!main) {
			pending.error = NO_MODEL;
			side.streaming = false;
			publish();
			return;
		}
		side.model = main.model.id;
		const controller = new AbortController();
		side.controller = controller;
		const hooks = main.options.onPayload;
		const onPayload: OnPayload = (payload, model) => hooks?.(payload, model);
		sideCallbacks.add(onPayload);
		publish();
		try {
			const stream = ctx.modelRegistry.streamSimple(
				main.model,
				{
					messages: [
						...main.messages,
						...threadMessages(side.exchanges),
						{
							role: "user",
							content: sideQuestion(question),
							timestamp: Date.now(),
						},
					],
				},
				{
					...main.options,
					onPayload,
					signal: controller.signal,
					// why: Codex WebSocket continuation state belongs to the main conversation.
					...(main.model.api === "openai-codex-responses"
						? { transport: "sse" as const }
						: {}),
				},
			);
			for await (const event of stream) {
				if (event.type !== "text_delta") continue;
				pending.text = textOf(event.partial);
				publish();
			}
			const answer = await stream.result();
			if (answer.stopReason === "aborted") throw new Error("Stopped.");
			if (answer.stopReason === "error")
				throw new Error(answer.errorMessage ?? "Side request failed.");
			if (!textOf(answer)) {
				const calls = answer.content.flatMap((part) =>
					part.type === "toolCall" ? [part.name] : [],
				);
				throw new Error(
					calls.length
						? `No text answer; the model tried to call ${calls.join(", ")}.`
						: "No text answer.",
				);
			}
			side.exchanges.push({
				question,
				answer: {
					...answer,
					content: answer.content.filter((part) => part.type !== "toolCall"),
					stopReason: "stop",
				},
			});
			side.pending = undefined;
		} catch (error) {
			pending.error = error instanceof Error ? error.message : String(error);
		} finally {
			side.controller = undefined;
			side.streaming = false;
			publish();
		}
	}

	async function runSide(initial: string, ctx: ExtensionContext) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let published = 0;
		const side: SideThread = {
			exchanges: [],
			streaming: false,
			model: "",
			ended: false,
			end,
		};
		function flush() {
			if (side.ended) return;
			published = Date.now();
			try {
				ctx.ui.setStatus(BTW_STATUS_KEY, serializeBtwThread(sideState(side)));
			} catch {
				// why: a replaced session leaves the captured context stale and Pi throws on it; the events end such a side thread anyway.
			}
		}
		function publish() {
			if (side.ended) return;
			const wait = PUBLISH_MS - (Date.now() - published);
			if (wait <= 0) {
				clearTimeout(timer);
				timer = undefined;
				flush();
				return;
			}
			timer ??= setTimeout(() => {
				timer = undefined;
				flush();
			}, wait);
		}
		function end() {
			if (side.ended) return;
			side.ended = true;
			side.controller?.abort();
			clearTimeout(timer);
			timer = undefined;
			try {
				ctx.ui.setStatus(BTW_STATUS_KEY, undefined);
			} catch {
				// why: the same stale context as in flush.
			}
			if (openSide === side) openSide = undefined;
		}
		openSide = side;
		side.model = (recorded(ctx)?.model ?? ctx.model)?.id ?? "";
		flush();
		let next = initial.trim() || undefined;
		try {
			for (;;) {
				let stream: Promise<void> | undefined;
				if (next !== undefined) {
					const question = next;
					next = undefined;
					stream = ask(side, question, ctx, publish);
				}
				const reply = await ctx.ui.editor(
					BTW_CHANNEL_TITLE,
					JSON.stringify({ v: 1 }),
				);
				if (side.ended) {
					await stream;
					break;
				}
				const parsed = parseBtwReply(reply);
				if (!parsed) {
					side.controller?.abort();
					await stream;
					break;
				}
				if ("stop" in parsed) {
					side.controller?.abort();
					await stream;
					publish();
					continue;
				}
				await stream;
				next = parsed.question;
			}
		} catch (error) {
			try {
				ctx.ui.notify(
					error instanceof Error ? error.message : String(error),
					"error",
				);
			} catch {
				// why: a stale context throws too; the side thread still ends.
			}
		} finally {
			end();
		}
	}

	pi.registerCommand("btw", {
		description: BTW_DESCRIPTION,
		handler: async (args, ctx) => {
			if (!ctx.hasUI)
				return ctx.ui.notify("/btw needs the interactive UI.", "warning");
			if (openSide) return ctx.ui.notify("/btw is already open.", "warning");
			void runSide(args, ctx);
		},
	});
}
