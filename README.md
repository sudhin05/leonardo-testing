# Model Lab — Leonardo model comparison

Run the same prompt across several Leonardo image (and video) models side by side, score the results on the team rubric, and see which model wins per ad category.

## Start

```bash
npm install
cp .env.example .env.local   # LEONARDO_API_KEY
npm run dev                  
```

Without a key the app runs in **MOCK MODE**: placeholder images, no credits spent. Use it to try the workflow. Set `LEONARDO_MOCK=1` to force mock mode even when a key is present.

Requires Node 22.5 or later, because it uses the built-in `node:sqlite`. All data lives in `./data/`:
- `lab.db`: prompts, runs, scores
- `media/`: every generated file, downloaded locally because Leonardo CDN links can expire
- `uploads/`: reference images

Delete `./data/` to start fresh.

## Pages

| Page | What it's for |
|---|---|
| **Compare** | Pick a prompt, toggle models, then **Generate**. A card per model shows its output, latency, credit cost and 1–5 scoring dots. Hover a card and tick **Compare** on 2–6 outputs to open them side by side with synced zoom, or with a slider for two. Use **All runs** to see past attempts. |
| **Matrix** | Every prompt × model as thumbnails, newest result in each cell, with Keep/Reject badges. |
| **Leaderboard** | Average Text / Realism / Brand colour scores, keep rate, success rate, time and credits per model. Includes a model × category heatmap and a CSV export. Mock runs are excluded unless you tick the box. |
| **Library** | The prompt sheet and products (SKUs). **Import CSV** to load the real sheet. Upload product reference images here. |
| **Models** | Enable or disable models, set per-model parameter overrides as JSON, and see exactly what request body is sent. You can add any other v2 model string. |

## How it works

- `src/lib/models.ts` is the model registry. Each entry defines the v2 `model` string, the size for each aspect ratio, the quantity field, and the reference-image guidance key. Requests go to `POST /api/rest/v2/generations`.
- `src/lib/worker.ts` is a background loop inside the server process. It moves each generation from queued to submitted to polled (`GET /api/rest/v1/generations/{id}`) to downloaded. It keeps at most `LEONARDO_MAX_CONCURRENT` generations in flight at once.
- Reference-image prompts (image-to-image) upload the image once through `/v1/init-image` and pass it to models that accept one. Models without an image input are marked **Skipped**.

## Notes

- **Unverified API detail:** Leonardo's docs don't document how to fetch v2 results. The app polls the v1 "get generation" endpoint and parses the response defensively. If the first live run stays "Generating" forever, this endpoint is the first thing to check.
