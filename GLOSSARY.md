# Pi OpenTUI

A separate terminal interface for the Pi coding agent, built from clickable, animated, user-arrangeable pieces. It runs beside the regular `pi`, not instead of it.

## Layout

**Slot**:
An independent rectangular area of the screen; either a Container or a Panel.
_Avoid_: Region, pane, cell

**Container**:
A Slot that holds child Slots laid out in a row or a column.
_Avoid_: Split, group, leaf

**Panel**:
A Slot that holds Modules laid out in a row or a column and scrolls on its own.
_Avoid_: Leaf, list, stack

**Layout**:
The tree of Slots that makes up the main screen.
_Avoid_: Template, scheme

**Modal**:
A Slot drawn above the Layout at a chosen position and size (centered by default) that takes focus until closed.
_Avoid_: Popup, window

**Config**:
The user's file that overrides the default Layout, Module placement and Module settings.
_Avoid_: Settings (that word belongs to Pi's own settings)

**Placement**:
The ordered list of Modules assigned to each Panel, kept apart from the Layout.
_Avoid_: Mapping, binding

## Content

**Module**:
A self-contained piece of interface that lives in a Panel and reads Pi's state or other sources to show something.
_Avoid_: Widget (that is Pi's word for an extension's text lines), plugin, component

**Extension**:
A package of this project that contributes Modules and, when needed, a Pi extension; built-in Modules are Extensions too. A bare "extension" always means this.
_Avoid_: Plugin, add-on

**Pi extension**:
Code that runs inside the Pi agent process, such as a tool or a command; an Extension may carry one.
_Avoid_: Backend extension, server part

**Backend**:
The Pi agent process this interface drives (`pi` or `pi-bolt`).
_Avoid_: Server, engine

**Dialog**:
A Pi extension's `select`, `confirm`, `input` or `editor` request, which stays pending until answered or closed; the app shows each as a Modal.
_Avoid_: Using it as a synonym for Modal

**Toast**:
A short notice that appears over the Layout and disappears on its own.
_Avoid_: Notification, alert
