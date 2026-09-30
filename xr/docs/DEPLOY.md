# Deploying the XR site

The XR site is a static bundle plus one serverless route (`/api/flights`). The
recommended host is **Vercel**, because it runs both from this folder with no
extra code.

## Why not GitHub Pages

| Need                                        | GitHub Pages | Vercel (Hobby)      |
| ------------------------------------------- | ------------ | ------------------- |
| Static HTTPS hosting (WebXR needs HTTPS)    | ✅           | ✅                  |
| `/api/flights` proxy (adsb.lol has no CORS) | ❌           | ✅ `api/flights.js` |
| Edge cache shared by all visitors           | ❌           | ✅ `s-maxage=10`    |
| Preview URL per branch / PR                 | ❌           | ✅                  |

On GitHub Pages the globe and earthquakes would work, but aircraft would not.
Vercel's Hobby plan is for personal, non-commercial projects. Check
Vercel's current terms if that changes.

## Vercel, first time (dashboard)

1. Push this branch to your fork (`origin` = `ckhsc17/gods-eye-view`).
2. In Vercel, choose **Add New → Project** and import the fork from GitHub.
3. Configure the project:
   - **Root Directory:** `xr`
   - **Framework Preset:** Vite (read from `vercel.json`)
   - **Include files outside the Root Directory in the Build Step:** leave it
     **enabled**. The build imports `../src/sources/live` and
     `../src/layers/earthquakes/source` from the parent app.
   - **Node.js version:** 22.x (Project Settings → Build and Deployment)
4. Optional: add the environment variable `VITE_GOOGLE_MAPS_API_KEY` (see
   [Google key](#google-key)).
5. Choose **Deploy**. You get `https://<project>.vercel.app`.

Every later push deploys automatically. Pushes to the production branch update
the main URL, and other branches get their own preview URLs.

The production branch defaults to `main`. While the XR work lives on a feature
branch, either merge it into your fork's `main` or set
**Settings → Git → Production Branch** to that branch.

## Vercel CLI (alternative)

Run the CLI from the **repository root**, not from `xr/`. Uploading only `xr/`
leaves out the parent sources the build imports.

```bash
npx vercel link          # once; set Root Directory to "xr" when asked or in the dashboard
npx vercel               # preview deployment
npx vercel --prod        # production deployment
```

## Checking a deployment

```bash
curl -s "https://<project>.vercel.app/api/flights?lat=25.03&lon=121.56" | head -c 200
```

You should see adsb.lol JSON (`{"ac":[...`). Then open the site in desktop
Chrome, press **Enter VR**, and confirm that the emulated Quest 3 panels
appear.

## Google key

A site-wide key is compiled into the public bundle, so anyone can read it.
Treat it as public and limit what it can do:

1. In Google Cloud, create a key that has only the **Map Tiles API** enabled.
2. Under **Application restrictions → Websites**, add
   `https://<project>.vercel.app/*`, any custom domain, and
   `http://localhost:4180/*` for local work.
3. Set a **quota** on the Map Tiles API and a **budget alert**. Referrer
   restrictions do not stop someone from copying your page. Only quotas cap
   the spend.
4. Add the key as `VITE_GOOGLE_MAPS_API_KEY` in Vercel and redeploy.

Without a site-wide key, visitors can paste their own key into the page. It
stays in their browser.

Google's terms require the attribution that the page shows in its credit line.
Keep it visible.

## Custom domain

Use **Project → Settings → Domains → Add**. WebXR only needs HTTPS, which
Vercel provisions automatically. Add the new origin to the Google key's
referrer list.

## Other hosts

Any host that serves static files and can run the handler in
`server/flights.js` works. The handler is a plain
`(Request) → Promise<Response>`:

- **Cloudflare Pages + Functions:** add `functions/api/flights.js` that exports
  `onRequestGet = ({ request }) => handleFlightsRequest(request)`.
- **Netlify:** add `netlify/functions/flights.mjs` that exports
  `default (request) => handleFlightsRequest(request)` and set
  `config = { path: '/api/flights' }`.
- **Any Node host:** `npm run build && npm run preview -- --host 0.0.0.0`. The
  preview server includes the proxy. Put it behind HTTPS.
