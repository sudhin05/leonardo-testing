# Model Lab — Leonardo model comparison

Run the same prompt across several Leonardo image (and later video) models side by side. Each team member scores the results, and everyone sees each other's votes, so the choice of model is a combined team decision.

## Start locally

```bash
npm install
cp .env.example .env.local   # LEONARDO_API_KEY; TEAM_PASSWORD optional locally
npm run dev
```

Without a key the app runs in **MOCK MODE**: placeholder images, no credits spent. Set `LEONARDO_MOCK=1` to force mock mode even when a key is present.

**Deploying for the team:** see [docs/DEPLOY.md](docs/DEPLOY.md). It uses Vercel, Vercel Blob and Turso, all on free tiers. `scripts/push-to-cloud.mjs` copies your local test runs up.

Locally, everything lives in `./data/`:
- `lab.db`: SQLite, opened with libSQL;
- `media/`: generated images, downloaded because Leonardo CDN links can expire;
- `uploads/`: reference images.

When deployed, the same data lives in Turso and Vercel Blob. It persists across restarts either way.

## Team, test runs and votes

- **Sign-in:** one shared team password (`TEAM_PASSWORD`), then each person picks their name. There are no individual accounts; it's built for a small, trusted team.
- **Test runs:** an independent set of prompts, results and votes. Use the switcher at the top left, or the **Runs** page, to open an old run or start a new one. Each person's selected run is their own, so switching never changes what anyone else sees. Add prompts to the current run (Library → Import or New prompt), or start a new run for a separate batch. Runs can be renamed or deleted (deleting requires typing the run's name).
- **Votes:** every person scores each image (Text, Realism, Brand colour, 1–5), marks **Keep** or **Reject** and can add a note.
  - Under your own controls you see everyone's votes, with names.
  - Cards and the Matrix show the team tally ("KEEP 3·1"). A purple dot in the Matrix marks images teammates voted on that you haven't.
  - The Leaderboard averages every vote and adds **How each person voted** (model × person), so disagreements are visible.
  - The PDF report and CSV export include every voter's verdict.
- **Model settings** (Models page) are shared across all test runs.

## Pages

| Page | What it's for |
|---|---|
| **Runs** | All test runs with prompt, image, vote and spend counts. Open, create, rename or delete one |
| **Compare** | Pick a prompt, toggle models, **Generate**. A card per model shows the output, time, cost, your vote and the team's votes. Tick **Compare** on 2–6 outputs (optionally plus the reference) for side-by-side view with synced zoom |
| **Matrix** | Every prompt × model, with team tallies and the reference image used. Click to vote in place. **Export PDF** downloads a report |
| **Leaderboard** | Team averages per model, keep rate, success rate, time and cost; per-person breakdown; model × category heatmap; CSV export |
| **Library** | Prompts and products in the current run. **Import sheet** takes `.xlsx` or `.csv` plus its reference images |
| **Models** | Enable or disable models, set per-model parameter overrides, see the exact request sent |

## Prompt sheets

The format is in [docs/PROMPT_SHEET_FORMAT.md](docs/PROMPT_SHEET_FORMAT.md); start from [templates/prompt-sheet-template.xlsx](templates/prompt-sheet-template.xlsx). The columns are `test_id, category, prompt, ref_image, aspect_ratio, product, product_name, criteria, output`, and only `prompt` is required. Reference images are uploaded one per request, each under 4.4 MB. AVIF and iPhone HEIC are converted automatically.

## Credits

Costs are stored in **US dollars**, as Leonardo reports them on create (`"cost":{"amount":…,"unit":"DOLLARS"}`). The top bar shows the live balance (`GET /v1/me`) and the current run's spend; the conversion is 669 credits per USD (`LEONARDO_CREDITS_PER_USD`). If Leonardo returns no cost, it's measured from the balance change, or else estimated from identical earlier calls. Failed generations are excluded, because Leonardo refunds them.

## How it works

- `src/lib/models.ts`: the model registry, holding the v2 model string, size per aspect ratio and reference-image key.
- `src/lib/worker.ts`: generation advances in short **ticks**, triggered by status polling from any open page and by Generate. Every state change is a conditional update, so concurrent ticks (several people, several serverless instances) never submit or save twice. States: queued → submitting → pending → completing → complete or failed.
- `src/lib/db.ts`: libSQL, either a local file or Turso. `src/lib/storage.ts`: local disk or Vercel Blob.
- `src/middleware.ts` + `src/lib/session.ts`: the signed sign-in cookie.

## Notes

- **Sizes must match the model:** some models only accept certain width × height pairs. They reject anything else with a bare `BadRequestException: An error occurred`. The Models page shows the size sent for each ratio.
- **Old archives:** rounds archived by the earlier "New round" button live in `data/archive/`. `scripts/merge-archive.mjs` turns one back into a test run. Round 1 has already been merged.
