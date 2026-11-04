# Prose Diff

Compare two versions of a piece of writing and merge them, one change at a time.

Every change is shown inline: removed text struck through in red, added text underlined in blue. Changes are compared word by word, not line by line, so a one-word edit doesn't flag a whole paragraph. Accept or reject each change, then take the merged result.

There are two ways to use it:

- **Web app**, at [prose-diff.vercel.app](https://prose-diff.vercel.app). Paste an original and a revised version, review the changes, and copy the merged result. Everything runs in the browser, so your text never leaves your machine.
- **Command line**, for a file on disk. Run `prose-diff` on the file to save its current text as the original. Then change the file: let an agent like Claude Code edit it, or paste your revised version into it yourself. Open the link `prose-diff` printed to review the changes in the same interface, and apply the merged result straight back to the file.

## Web app

Open [prose-diff.vercel.app](https://prose-diff.vercel.app), paste the two versions and press **Compare** (or `Ctrl`+`Enter`). Your texts and decisions are saved in your browser, so they survive a refresh. See [How it works](#how-it-works) and [Keyboard shortcuts](#keyboard-shortcuts).

## Command line

The command line tool runs from a clone of this repo:

```sh
npm install
npm run build && npm link   # once: puts `prose-diff` on your PATH
prose-diff draft.md          # saves draft.md as the original and prints a link
```

`npm link` puts a global symlink to this repo on your PATH, so changes to the repo take effect without linking again (run `npm run build` after changing the app). With nvm, the link only exists for the Node version that was active when you ran it. To remove it, run `npm rm -g prose-diff`.

Edit `draft.md` however you like (by hand, or with Claude Code or another tool). Then open the printed link, or refresh it, to review the original against the file as it is now. **Apply to file** (`w`) writes the merged result back to `draft.md`. Undecided changes are reverted to the original, after you confirm. The merged text becomes the new original, so you can keep editing and reviewing in rounds until you stop `prose-diff` with Ctrl+C. If the file changed again after you loaded the page, Apply refuses to write and offers to reload.

The page is served by `prose-diff` itself on your machine, not by the hosted web app. The server only listens on 127.0.0.1, and the link carries a token the page needs to read or write the file. Decisions survive a refresh as long as the file hasn't changed. They're kept per tab, separately from the texts saved in paste mode.

## How it works

- Hover over or click a change to show its ✓ accept / ✗ reject buttons. Decided changes show ↺ Undo, so you can change your mind.
- The right margin of the page tallies your decisions: ✓ accepted, ✗ rejected and • undecided, one row per line with changes. Click a mark to jump to its change.
- The strip at the window's right edge maps the whole document: a tick for each change (grey undecided, blue accepted, red rejected) and a shaded box for the part you're looking at. It takes the place of the scrollbar: drag the shaded box to scroll, or click anywhere on the strip to jump there.
- **Accept all**, **Reject all** and **Reset** apply to every change at once.
- **Copy result** copies the merged text. Changes you haven't decided on keep your original wording.
- **Continue from result** starts the next round: the merged text becomes the new original and Revised is cleared for your next draft. The toast that appears has an **Undo** button that brings back the previous round.
- A long stretch where nearly every line was rewritten is shown as one change for the whole stretch, so it stays quick to compare.
- Edits to spaces and line breaks are shown with `·`, `→` and `¶` markers. These only appear on screen, not in the copied text.
- Your text and decisions are saved in the browser's local storage, so they survive a refresh. Changing the inputs and comparing again clears the decisions.
- Drag the handle on the page's right edge to change how many characters fit on a line (30–120, as far as the window allows). Double-click it to go back to 65. You can also focus it and use the arrow keys, or press `[` and `]` anywhere. The width is saved with the rest of your session.
- Dark mode follows your system setting. The ◐ button overrides it.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `j` / `↓` | Next change |
| `k` / `↑` | Previous change |
| `g` / `G` | First / last change |
| `a` / `Enter` | Accept, then go to next undecided change |
| `r` / `Backspace` | Reject, then go to next undecided change |
| `u` | Undo decision |
| `c` | Copy result |
| `n` | Continue from result |
| `w` | Apply to file (when reviewing a file) |
| `[` / `]` | Narrow / widen the page |
| `Ctrl`+`Enter` | Compare (on the paste screen) |
| `?` | Show shortcuts |

## Development

```sh
npm install
npm run dev       # start the dev server
npm test          # run unit tests
npm run build     # type-check, then build static files into dist/
```

`dist/` is plain static files, so you can host it anywhere or serve it locally with `npm run preview`.

## Project layout

```
src/diff.ts        word-level diff, grouping into changes, merging (pure, tested)
src/diff.test.ts   unit tests (Vitest)
src/state.ts       app state and local storage persistence
src/render.ts      paste and review views, copy, toast
src/keyboard.ts    keyboard shortcuts
src/main.ts        startup and event wiring
src/fileMode.ts    talking to the `prose-diff <file>` server
cli/prose-diff.ts  the `prose-diff <file>` command
cli/server.ts      its local server: serves dist/, reads and writes the file (tested)
src/style.css      light and dark themes
```

Built with Vite, TypeScript and [jsdiff](https://github.com/kpdecker/jsdiff).
