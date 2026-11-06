# TODO

In priority order.

- Keep decisions across a reload for changes that are still identical (define matching for repeated changes).
- Undo for the last apply.
- Snapshots persisted on disk (`--resume`), maybe.
- Several files per session.
- Multiple projects in paste mode (shares a switcher and per-document state with several files; see notes).

## Notes

### Multiple projects

Keep several original/revised pairs in progress and switch between them from a header menu (new, switch, rename, delete). Today there's one pair under `prose-diff:v1`, so starting another replaces it, and two tabs overwrite each other. Store each project's texts, decisions, `decisionsKey`, `focusedId` and view separately from the shared theme and measure, migrate an existing `prose-diff:v1` entry into the first project, track the open project per tab, and show a clear error when `localStorage` is full.
