# Pi OpenTUI

A modular terminal interface for [Pi](https://github.com/earendil-works/pi), the coding agent. You can swap out, rearrange or add to any part of the screen.

> **Early development.** Things are rough, change often and will break. Look around, but don't rely on it yet.

## Why

Pi's own terminal interface is a single column of text that you drive with the keyboard. You can't click anything, and you can't rearrange the screen or replace a part you don't like.

Pi OpenTUI is a different frontend for the same agent. It runs next to the regular `pi`, not instead of it, so you can go back whenever you want. Your sessions, models, settings and Pi extensions all work as before.

## The idea

The screen is built from small, independent pieces called modules. The chat is a module, and so are the prompt input and the little label that shows the current model. Nothing is hard-wired, and the built-in pieces are made the way yours would be.

If you don't like the chat, write another one and put it in its place. The same goes for the input, the status line or any other piece. You can also add your own: a module can show a to-do list, a cost counter, a view of running subagents or a clock.

You decide where each module goes, how big it is and what happens on a narrow terminal. Rows and columns nest as deep as you like, and each area scrolls on its own.

The interface is clickable and animated, and it stays responsive while the agent is busy.

Modules travel in packages called extensions. A package can carry a Pi extension too, so a module and the agent-side tool it talks to ship together. Even the built-in features are extensions, so you can do anything the project does.

## Who it's for

People who use Pi every day and want their terminal to work the way they do, and tinkerers who would rather build their own piece than wait for someone else's. If you've ever looked at an agent's interface and thought, "I'd put that over there," that includes you.

## Status

The core works: a customizable layout, a chat, an input, model and reasoning pickers, and live cards for running subagents. The way you write modules will probably change before it settles.

If you like where this is going, watch the repository.
