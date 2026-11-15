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

Everything persists across restarts. Prompts, generations, images, scores and costs stay until you delete them, so closing the laptop and running `npm run dev` again brings back exactly what you had. Generations still in progress when the app stopped are collected on the next start, because Leonardo keeps working on them in the meantime. Delete `./data/` to start fresh, but copy it somewhere first if you want to keep a round.

**Viewing images:** every viewer starts with the image fitted to the screen. Scroll to zoom around the cursor, drag to pan, and double-click to toggle. **Fit** and **1:1** (actual pixels) are bottom-right. In side-by-side comparison, zoom and pan are synced across all panes. The **+ reference** option adds the reference image as one of the panes.

## Pages

| Page | What it's for |
|---|---|
| **Compare** | Pick a prompt, toggle models, then **Generate**. A card per model shows its output, latency, credit cost and 1–5 scoring dots. Hover a card and tick **Compare** on 2–6 outputs to open them side by side with synced zoom, or with a slider for two. Use **All runs** to see past attempts. |
| **Matrix** | Every prompt × model as thumbnails, newest result in each cell, with Keep/Reject badges and cost. A Reference column shows each prompt's input image. Each cell also shows, as an inset, the reference image that generation actually used. Clicking a result opens it in a viewer on this page, where you can score it, browse the whole matrix with ← →, and press R to flip between the result and its reference image. **Export PDF** downloads a report: a leaderboard summary followed by the matrix with images, for all prompts or the selected category. |
| **Leaderboard** | Average Text / Realism / Brand colour scores, keep rate, success rate, time and credits per model. Includes a model × category heatmap and a CSV export. Mock runs are excluded unless you tick the box. |
| **Library** | The prompt sheet and products. **Import** takes an `.xlsx` or `.csv` sheet plus its reference images (see below). You can also upload or replace reference images on individual products here. |
| **Models** | Enable or disable models, set per-model parameter overrides as JSON, and see exactly what request body is sent. You can add any other v2 model string. |

## Prompt sheets

Every test round uses the same format, described in [docs/PROMPT_SHEET_FORMAT.md](docs/PROMPT_SHEET_FORMAT.md). Start from [templates/prompt-sheet-template.xlsx](templates/prompt-sheet-template.xlsx) or the `.csv` version.

The columns are `test_id, category, prompt, ref_image, aspect_ratio, product, product_name, criteria, output`. Only `prompt` is required. `ref_image` is a file name from the images folder you upload with the sheet.

## Credits

Costs are in **US dollars**, because that's what Leonardo reports. When a generation is created, the response includes `"cost":{"amount":"0.0897","unit":"DOLLARS"}`, and `apiCreditCost` is null.

- **The top bar shows your live balance**, read from Leonardo (`GET /v1/me` → `apiPaidTokens`), in API credits with a dollar equivalent. It also shows how much Model Lab has spent, in dollars. The conversion is **669 credits per USD**, measured from balance changes on 2026-11-14; override it with `LEONARDO_CREDITS_PER_USD`.
- **Every generation records its dollar cost**, which appears on the cards, in the Matrix, on the Leaderboard ($ per image and total $) and in the CSV export (`cost_usd`). The cost comes from one of these, in order:
  1. `api`: the cost Leonardo returns when the generation is created. This is the normal case.
  2. `measured`: if no cost is returned, the drop in your balance across that single submission, divided by 669. Live submissions are sent one at a time so each drop can be attributed to the right generation.
  3. `estimate` (shown with `~`): the average of earlier generations with identical settings.
- **Failed generations are left out of spend totals,** because Leonardo refunds them.
- **The balance includes usage outside this app,** for example the Leonardo website. If someone uses the same account at the same moment as a submission, that measured cost can be off.

## How it works

- `src/lib/models.ts` is the model registry. Each entry defines the v2 `model` string, the size for each aspect ratio, the quantity field, and the reference-image guidance key. Requests go to `POST /api/rest/v2/generations`.
- `src/lib/worker.ts` is a background loop inside the server process. It moves each generation from queued to submitted to polled (`GET /api/rest/v1/generations/{id}`) to downloaded. It keeps at most `LEONARDO_MAX_CONCURRENT` generations in flight at once.
- Reference-image prompts (image-to-image) upload the image once through `/v1/init-image` and pass it to models that accept one. Models without an image input are marked **Skipped**.

## Notes

- **Fetching results:** v2 generations are fetched through the v1 "get generation" endpoint. This is confirmed working against the live API on 2026-11-14.
- **Reference image formats:** reference images in formats Leonardo can't take (AVIF, HEIC, …) are converted to PNG on import or upload.
- **Sizes must match the model:** some models only accept certain width × height pairs and reject anything else with a bare `BadRequestException: An error occurred`. Ideogram 4.5 rejected 896×1152, and GPT Image 2 rejected 912×1136. Sizes for Ideogram and Recraft are now chosen from their allowed lists with an exact aspect-ratio match, so 4:5 is 896×1120 and 1024×1280 respectively. If a model fails with that generic error, check its size first. The Models page shows the size sent for each ratio, and overrides such as `{"width":1024,"height":1024}` let you test a different one.
