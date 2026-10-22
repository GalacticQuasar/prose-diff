# Prose Diff

Merge an LLM's rewrite into your own writing, one change at a time, like GitHub Copilot's inline diffs in VS Code.

Paste your original text and the LLM's revised text to see every change inline: removed text in red, added text in green. Changes are compared word by word, not line by line. Accept or reject each change, then copy the merged result. Everything runs in the browser; your text never leaves your machine.

## Usage

```sh
npm install
npm run dev       # start the dev server
npm test          # run unit tests
npm run build     # build static files into dist/
```

`dist/` is plain static files, so you can host it anywhere or serve it locally with `npm run preview`.

## How it works

- Hover over or click a change to show its ✓ accept / ✗ reject buttons. Decided changes show ↺ Undo, so you can change your mind.
- **Accept all**, **Reject all** and **Reset** apply to every change at once.
- **Copy result** copies the merged text. Changes you haven't decided on keep your original wording.
- Edits to spaces and line breaks are shown with `·`, `→` and `¶` markers. These only appear on screen, not in the copied text.
- Your text and decisions are saved in the browser's local storage, so they survive a refresh. Changing the inputs and comparing again clears the decisions.
- Dark mode follows your system setting. The ◐ button overrides it.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `j` / `↓` | Next change |
| `k` / `↑` | Previous change |
| `a` / `Enter` | Accept, then go to next undecided change |
| `r` / `Backspace` | Reject, then go to next undecided change |
| `u` | Undo decision |
| `Shift`+`A` / `Shift`+`R` | Accept all / reject all |
| `c` | Copy result |
| `Ctrl`+`Enter` | Compare (on the paste screen) |
| `?` | Show shortcuts |

## Project layout

```
src/diff.ts        word-level diff, grouping into changes, merging (pure, tested)
src/diff.test.ts   unit tests (Vitest)
src/state.ts       app state and local storage persistence
src/render.ts      paste and review views, copy, toast
src/keyboard.ts    keyboard shortcuts
src/main.ts        startup and event wiring
src/style.css      light and dark themes
BRIEF.md           original spec
```

Built with Vite, TypeScript and [jsdiff](https://github.com/kpdecker/jsdiff).
