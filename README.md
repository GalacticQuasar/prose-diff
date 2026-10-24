# Prose Diff

Compare two versions of a piece of writing and merge them, one change at a time.

Paste an original and a revised version to see every change inline: removed text struck through in red, added text underlined in blue. Changes are compared word by word, not line by line, so a one-word edit doesn't flag a whole paragraph. Accept or reject each change, then copy the merged result. Everything runs in the browser; your text never leaves your machine.

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
- The right margin of the page tallies your decisions: ✓ accepted, ✗ rejected and • undecided, one row per line with changes. Click a mark to jump to its change.
- **Accept all**, **Reject all** and **Reset** apply to every change at once.
- **Copy result** copies the merged text. Changes you haven't decided on keep your original wording.
- **Continue from result** starts the next round: the merged text becomes the new original and Revised is cleared for your next draft. The toast that appears has an **Undo** button that brings back the previous round.
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
| `n` | Continue from result |
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
```

Built with Vite, TypeScript and [jsdiff](https://github.com/kpdecker/jsdiff).
