# Greeting command design

## Goal

Add a tiny command-line program that prints a configurable greeting.

## Requirements

- Add `src/greet.js` with an exported `greet(name)` function.
- Default an omitted name to `world`.
- Add a `greet` package script that accepts a name argument.
- Add deterministic unit tests for explicit and default names.
- Document the command in this project's README.

## Out of scope

- Network calls
- Persistent storage
- A graphical interface

## Acceptance criteria

Running `npm run greet -- Ada` prints `Hello, Ada!`, and the unit tests pass without provider credentials or network access.
