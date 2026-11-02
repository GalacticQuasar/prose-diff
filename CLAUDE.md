# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev                          # Vite dev server
npm test                             # Vitest, single run
npx vitest run -t "flags only"       # run tests whose name matches
npm run build                        # tsc type-check (noEmit), then vite build into dist/
npm run preview                      # serve dist/
```

No linter is configured. `npm run build` is the type check (`strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, so type-only imports need `import type` / `type X`).

## What it is

Prose Diff is a client-only browser app with no framework. You paste an original and a revised text, review word-level changes inline, accept or reject each one, and copy the merged result. The user-facing behavior and keyboard shortcuts are documented in README.md. Keep the README's "How it works" and "Keyboard shortcuts" sections, and the in-app help dialog in `index.html`, in sync when behavior changes.

## Architecture

The data flow goes in one direction: `diff.ts` (pure) → `state.ts` (store) → `render.ts` (DOM), with `main.ts`/`keyboard.ts` wiring events to state actions.

- **`diff.ts`**: the only tested module, with no DOM access. `buildSegments` runs jsdiff's `diffWordsWithSpace`, then `alignToLines` slides pure insertions or deletions that span lines so they cover whole lines. Changes separated only by 1–3 spaces or tabs (`JOINABLE_GAP`) are folded into one change. Change ids are assigned sequentially after grouping, so **ids are positional**: they only stay meaningful for a fixed `(original, revised)` pair. `mergeResult` treats undecided (`pending`) changes as keeping the original text.
- **`state.ts`**: a module-level `state` object plus derived `segments`/`ids`, which are recomputed only in `compare()` and in the undo closure of `continueFromResult()`, not on every update. `update()` replaces state, persists the whole thing to `localStorage` under `prose-diff:v1`, and notifies subscribers (`render`). `setInputs` intentionally skips notifying (typing shouldn't re-render) and sets `dirty`. `compare()` clears decisions only when `dirty`, because edited inputs invalidate positional ids. Persisted state is merged over `initial` on load, so new `State` fields need a default there.
- **`render.ts`**: full re-render on every state change (`doc.replaceChildren(...)`). Changes are rendered as `span.chg[data-id]` with a `pending`/`accepted`/`rejected` class. Margin marks, the floating accept/reject buttons (`#change-actions`) and the keyboard-shortcut panel are positioned from measured layout (`getClientRects`), so layout-affecting changes (measure/width, theme, fonts) need a relayout. Whitespace-only edits get display-only `·`/`→`/`¶` markers via `visible()`; the copied text never includes them.
- **`keyboard.ts`**: one keydown handler with a key→action map. It is ignored while the help dialog is open or while typing. On the paste view, only Ctrl/Cmd+Enter and `?` are active.
- **`index.html`**: holds all static markup (both views, toolbar, help dialog). Scripts look elements up by id at module load.
- **`style.css`**: a "typed manuscript" look (Courier Prime) with light/dark themes. Theme is `null` (follow system) or an explicit override.
