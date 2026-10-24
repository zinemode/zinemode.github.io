# zinemode.github.io

The website for [ZineMode](https://github.com/zinemode/ZineMode): <https://zinemode.github.io/>

- `src/index.html` is the install page template.
- `scripts/build.mjs` downloads the latest ZineMode release (and a newer prerelease, if any) from GitHub and renders the site into `_site/`:
  - `/` install page for the release channel
  - `/release/` the release's files: `ZineMode.user.js`, `bookmarklet.txt`, `version.json`, previews
  - `/beta/` the same for the latest prerelease, with its own install page
- `.github/workflows/deploy.yml` publishes to GitHub Pages on pushes to `main`, on the `zinemode-release` event that ZineMode's release workflow sends, and by hand ("Run workflow").

Installed userscripts update from `/release/ZineMode.user.js` (or `/beta/…`), and bookmarklets check `/<channel>/version.json`, so those paths must stay stable.

Try it locally against a ZineMode build: `ZM_LOCAL_DIST=../ZineMode/dist node scripts/build.mjs`, then open `_site/index.html`.
