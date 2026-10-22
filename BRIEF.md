# Prose Diff

A simple web app for merging an LLM's rewrite into my own writing, change by change, like GitHub Copilot's inline diffs in VS Code.

## Problem

When an LLM revises my text, I can't easily tell what it changed. Right now I compare the two versions in a diff site, then copy the changes I like into my original by hand.

## What I want

- Paste my original text and the LLM's revised text.
- See the changes inline in one view: removed text in red, added text in green.
- Changes are compared word by word, not line by line, so a one-word edit doesn't flag a whole paragraph.
- Accept or reject each change individually, and change my mind afterward.
- Accept all / reject all.
- Copy the merged result to my clipboard with one click.

## Nice to have

- Keyboard shortcuts to move between changes and accept/reject them.
- My work survives a page refresh.
- Dark mode.

## Out of scope

- No AI built in; I bring my own LLM output.
- No accounts or backend; my text stays in the browser.
- Plain text only.

