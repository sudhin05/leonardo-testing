# Deploying Model Lab for the team (free tier)

About 20–30 minutes, once. Uses three free services: **GitHub** (code), **Vercel** (the app plus image storage) and **Turso** (the database).

| Piece | Service | Free allowance | Why |
|---|---|---|---|
| App | Vercel Hobby | Plenty for 5 people | Push-to-deploy Next.js |
| Images | Vercel Blob | 1 GB | Generated images and reference uploads (about 1 MB each, so roughly 1,000 images) |
| Database | Turso | 5 GB | SQLite in the cloud; same SQL as the local app |

> **Vercel's Hobby plan is for non-commercial use.** It suits an internal trial. If Model Lab becomes part of client work, move the project to Vercel Pro (US$20 per member a month; only the deployer needs a seat). Nothing else changes.

## 1. Push the code to GitHub

1. Create a **private** repository on GitHub, for example `figgo-model-lab`.
2. From `leonardo-model-lab/`, push your commits to it. `data/`, `.env*` and other local files are git-ignored, so the API key and images stay on your machine:
   ```bash
   git remote add origin https://github.com/<you>/figgo-model-lab.git
   git push -u origin main
   ```

## 2. Create the Turso database

1. Sign up at [turso.tech](https://turso.tech) (GitHub sign-in works).
2. Create a database, for example `model-lab`. Pick the location closest to you; Sydney is best for Australia if offered.
3. On the database page, copy:
   - the **URL**: `libsql://model-lab-<you>.turso.io`, which becomes `TURSO_DATABASE_URL`;
   - a new **token**, from "Create token" (read and write), which becomes `TURSO_AUTH_TOKEN`.

You don't need to create any tables. The app creates them the first time it runs.

## 3. Create the Vercel project

1. Sign up at [vercel.com](https://vercel.com) with GitHub, then **Add New → Project** and import the repository.
2. Framework: Next.js, detected automatically. If the repository root is the parent folder, set the **Root Directory** to `leonardo-model-lab`.
3. Before the first deploy, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `LEONARDO_API_KEY` | Your Leonardo production API key |
| `TEAM_PASSWORD` | A password to share with the team |
| `SESSION_SECRET` | A long random string, e.g. from `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"` |
| `TEAM_MAX_MEMBERS` | `6` |
| `TURSO_DATABASE_URL` | From step 2 |
| `TURSO_AUTH_TOKEN` | From step 2 |

4. Click **Deploy**.

## 4. Add image storage (Vercel Blob)

1. In the project: **Storage → Create → Blob**. Name it `model-lab-images` and connect it to the project, for all environments.
2. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.
3. **Deployments → ⋯ → Redeploy** so the app picks it up.

## 5. Bring over the existing test runs (optional)

Your local Round 1 and Round 2, with their images, can be copied up once.

1. Create `leonardo-model-lab/.env.cloud`. It's git-ignored. Add:
   ```
   TURSO_DATABASE_URL=libsql://…
   TURSO_AUTH_TOKEN=…
   BLOB_READ_WRITE_TOKEN=…   (Vercel → Storage → your Blob store → .env.local tab)
   ```
2. Run:
   ```bash
   node --env-file=.env.cloud scripts/push-to-cloud.mjs
   ```
   It copies every table and uploads about 70 images. It refuses to run if the cloud database already has test runs; `--force` merges anyway.

## 6. Invite the team

Share the Vercel URL (`https://<project>.vercel.app`) and the team password. Each person picks **"I'm new here"** the first time and types their name. Votes appear under that name.

## How it behaves once deployed

- **Test runs:** the switcher at the top left. Each person's choice of run is their own. Anyone can start a new run or add prompts to the current one.
- **Generation progresses while someone has the app open,** because serverless hosting has no always-on process; every open page nudges it every 4 seconds. If everyone closes the app mid-generation, Leonardo still finishes, and the results are collected the next time anyone opens it. Results finished more than 15 minutes earlier are still fetched.
- **Upload limit:** reference images must be under 4.4 MB each. A typical iPhone HEIC is 2–4 MB.
- **Costs:** the top bar shows the Leonardo balance and what the current run has spent.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Not signed in" loop | `SESSION_SECRET` changed or is missing; set it and sign in again |
| Images don't load after deploy | Blob store not connected, or no redeploy after connecting (step 4) |
| "Create a test run first" | Make one from the switcher or the **Runs** page |
| Generations stay "Generating" | Keep a page open; check that `LEONARDO_API_KEY` is set in Vercel |
| Build fails on `sharp` | Redeploy with "Clear build cache" |
