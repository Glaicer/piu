# 09: Modal platform, model and reasoning

**What to build:** Modals: any Slot can open above the Layout at a position and size (centered by default), keyboard focus is trapped inside, Esc or a click outside closes it, and Modals can stack. Under the input, built-in model and reasoning Modules show the current model and reasoning level. Clicking the model opens a picker of the Backend's available models, and clicking the reasoning level opens a picker of the levels the current model supports. Choosing one updates the Backend and the shown value.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Clicking the model Module opens a centered Modal listing the faux models, and picking one changes the model shown and in Backend state
- [ ] The reasoning picker lists only the current model's supported levels, and picking one updates it
- [ ] Esc and a click outside each close the Modal
- [ ] Typing while a Modal is open doesn't change the input underneath
- [ ] A Modal opened from a Modal stacks, and Esc closes only the top one
