# Publishing to GitHub Pages (with the SRD content built in)

There are two ways to publish. **Option A is recommended**: GitHub builds the app, downloads the free SRD content packs, runs every test and publishes the result. Each device then installs the SRD content automatically the first time the app opens.

## Option A: GitHub builds and publishes (recommended)

One-off setup:

1. Unzip `ledger-project-for-github.zip`. It contains the whole project: `src`, `app`, `tests`, `scripts`, `docs`, `.github`, `package.json` and so on.
2. You do not need to delete the files you uploaded before. Once Pages uses GitHub Actions, only the built app is published and the old files are ignored.
3. **Add file → Upload files**: drag in **everything inside** the unzipped folder, including the hidden `.github` folder. In Windows File Explorer, turn on **View → Show → Hidden items** to see it. Click **Commit changes**.
4. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
5. Open the **Actions** tab. *Build and publish* runs, taking about 2–4 minutes; when it shows a green tick the site is live.

For each later update, upload the changed files the same way. Every commit rebuilds and republishes automatically.

The repository then contains only source code and SRD material. **My content stays on your devices** and is never uploaded.

If the *Build and publish* run is red, open it to see which step failed. If only a "content" step failed (a source site was unavailable), the site is still published, just without that pack; the Download buttons on the Content packs screen still work.

## Option B: upload only the built app (as before)

Upload the contents of `app/` and keep Pages set to **Deploy from a branch**. Everything works, but each device must press **Download** on More → Content packs once to fetch the SRD content.
