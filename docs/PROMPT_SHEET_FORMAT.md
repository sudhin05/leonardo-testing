# Prompt sheet format

Use this format for every test round. Start from `templates/prompt-sheet-template.xlsx`, or the `.csv` version.

`templates/prompt-sheet-example.xlsx` is a filled-in sample with 6 rows covering each kind of test: product photo, sale poster with exact text, food, logo-based poster, a text-only story and a text-only banner. It also has a **HOW TO FILL** tab. Share it with anyone writing a sheet for the first time.

A test round is two things:
1. **The sheet**, an `.xlsx` or `.csv` file with one row per prompt. The first row holds the column names below.
2. **The images folder**, which holds every reference image the sheet names.

## Columns

| column | required? | what to put in it |
|---|---|---|
| `test_id` | optional | A unique ID such as `T-01`. Leave it blank and the app numbers the rows for you. |
| `category` | recommended | The ad placement or use case, for example `Insta poster`, `Website thumbnail`, `Doordash thumbnail`. The app groups prompts by this, and the leaderboard compares models within each category, so spell it the same way every time. |
| `prompt` | **required** | The exact prompt sent to every model. Put any text that must appear in the image in double quotes: `"WE'RE OPENING!"`. |
| `ref_image` | optional | The file name of the reference image, for example `burger.jpg`. You can leave off the extension (`burger`). Leave the cell blank for text-to-image. Any image format works; AVIF, HEIC and similar are converted to PNG automatically. |
| `aspect_ratio` | recommended | One of `1:1` `4:5` `9:16` `16:9` `2:3` `3:2` `3:4` `4:3`. If it's blank, the app looks for a ratio written in the prompt (e.g. "4:5 portrait"). If it finds none, it uses `1:1`. |
| `product` | optional | A product code or SKU. Rows with the same product share one reference upload. If blank, the app uses the `ref_image` file name. |
| `product_name` | optional | A readable name for the product. |
| `criteria` | optional | What reviewers should check, for example "Exact spelling of all text; bottle shape unchanged". It's shown beside the results while scoring. |
| `output` | optional | `image` (the default) or `video`. |

## Rules

- Keep the prompts on the **first tab** of the workbook. A README tab after it is fine.
- Use one row per prompt. To test the same product in two placements, add two rows with the same `ref_image`.
- Image names are matched without regard to case. Two images must not share a file name, even if their extensions differ.
- Leave out any column you don't need. Don't rename the ones you keep.
- Older column names are still accepted: `Tag` for `category`, `address` for `ref_image`, `Target SKU` for `product`, `What to Evaluate` for `criteria`, and `Standardized Test Prompt` for `prompt`.

## Loading a round

1. In Model Lab, go to **Library → Import**.
2. Choose the sheet.
3. Choose the reference images: open the images folder and select every file.
4. Tick **Replace all existing prompts** only to start a fresh round. It deletes earlier generations and scores.

The import summary lists any problem rows, such as an image that wasn't found or a missing aspect ratio.
