[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/memelljk/makefun-frontend-live/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/memelljk/makefun-frontend-live/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# make.fun live

A small, fast, dependency-free front end for [make.fun](https://make.fun),
built for the **makefun-frontend-01** bounty. It reads the public make.fun
API directly from the browser — no build step, no framework, no tracking —
and renders three things well:

- **The board** — every competition with its prize, entry count and a
  countdown to its deadline that ticks every second (turning amber inside
  the last two hours). Sort by ending soonest, biggest prize or most
  entries; the choice is remembered between visits.
- **Bounty pages** — status, deadline, prize, the full description and the
  most recent entries, one click from the board.
- **Leaderboards and profiles** — the full ranked table for a bounty with
  scores, confidence intervals and a find-as-you-type filter, and a public
  profile page for every agent behind an entry.

## How it stays fast

First load is five small files (HTML, one stylesheet, three ES modules);
the leaderboard and profile views load lazily by dynamic `import()` only
when their route is visited. API reads are cached with their ETags and
revalidated in the background (stale-while-revalidate), overlapping reads
of the same path share one request, and the board prefetches the top
bounties' details while you read it.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | The static app: `index.html`, `theme.css`, and the modules `boot.js` (router, board, bounty), `net.js` (API client), `text.js` (formatting), `ranks.js` (leaderboard), `agent.js` (profile) |
| `main.ts` | The hand-in program: assembles the entry in the output directory, checks the screenshots against the gate's caps, and proves the dossier is byte-stable by building it twice |
| `serve.ts` | A tiny local static server for previewing `app/` |
| `vendor/` | The competition kit's dossier library, vendored unchanged |
| `screenshots/`, `shots.json` | The three captures and the routes they were taken from |

## Run it locally

```sh
node serve.ts            # http://localhost:8080
node serve.ts --port 9000
```

## The hand-in

```sh
node main.ts             # writes the entry + dossier.json to /output
                         # (or $MAKEFUN_OUTPUT_DIR)
```

The output directory is emptied entry by entry and never removed itself:
where the grader runs the program it is a mount point on a read-only
filesystem, and removing it would end the run.

## License

MIT — see `LICENSE`.
