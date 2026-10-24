// Builds https://zinemode.github.io/ into _site/ from the page template in src/ and the latest
// ZineMode releases on GitHub:
//   /release/   files of the latest regular release (userscript, bookmarklet, version.json, previews)
//   /beta/      files of the latest prerelease, if it is newer than the latest release, plus its own page
//   /           the install page for the release channel
//
// Local testing without GitHub: ZM_LOCAL_DIST=/path/to/ZineMode/dist node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";

const REPO = "zinemode/ZineMode";
const SITE = "https://zinemode.github.io/";
const OUT = "_site";

// Same rules as ZineMode's src/version.js: 0.3.0 > 0.3.0-beta.2 > 0.3.0-beta.1 > 0.2.0
function compare(a, b) {
  const parse = v => { const [c, p] = String(v).replace(/^v/, "").split("-", 2); return { n: c.split(".").map(x => parseInt(x, 10) || 0), p: p ? p.split(".") : [] }; };
  const A = parse(a), B = parse(b);
  for (let i = 0; i < 3; i++) if ((A.n[i] || 0) !== (B.n[i] || 0)) return (A.n[i] || 0) - (B.n[i] || 0);
  if (!A.p.length || !B.p.length) return B.p.length - A.p.length;
  for (let i = 0; i < Math.max(A.p.length, B.p.length); i++) {
    const x = A.p[i], y = B.p[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny && +x !== +y) return +x - +y;
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const headers = { Accept: "application/vnd.github+json", "User-Agent": "zinemode-site-build" };
if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
async function api(path) {
  const r = await fetch("https://api.github.com/repos/" + REPO + path, { headers });
  if (!r.ok) throw new Error(`GitHub API ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url, { headers: { "User-Agent": headers["User-Agent"] } });
  if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

// Collect the channels to publish: [{ channel, version, notes, dir }]
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const channels = [];

if (process.env.ZM_LOCAL_DIST) {
  const dir = OUT + "/release";
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(process.env.ZM_LOCAL_DIST)) copyFileSync(process.env.ZM_LOCAL_DIST + "/" + f, dir + "/" + f);
  const { version } = JSON.parse(readFileSync(dir + "/version.json", "utf8"));
  channels.push({ channel: "release", version, notes: `https://github.com/${REPO}/releases` });
} else {
  const releases = (await api("/releases?per_page=50")).filter(r => !r.draft);
  const stable = releases.find(r => !r.prerelease);
  const beta = releases.find(r => r.prerelease);
  if (!stable) throw new Error("No published ZineMode release yet: cut one by pushing a version tag in " + REPO);
  const picks = [["release", stable]];
  if (beta && compare(beta.tag_name, stable.tag_name) > 0) picks.push(["beta", beta]);
  for (const [channel, rel] of picks) {
    const dir = OUT + "/" + channel;
    mkdirSync(dir, { recursive: true });
    for (const a of rel.assets) await download(a.browser_download_url, dir + "/" + a.name);
    channels.push({ channel, version: rel.tag_name.replace(/^v/, ""), notes: rel.html_url });
    console.log(`${channel}: ${rel.tag_name} (${rel.assets.length} files)`);
  }
}

// Render one install page per channel
const template = readFileSync("src/index.html", "utf8");
const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hasBeta = channels.some(c => c.channel === "beta");
for (const c of channels) {
  const dir = OUT + "/" + c.channel;
  const bookmarklet = readFileSync(dir + "/bookmarklet.txt", "utf8");
  const isRelease = c.channel === "release";
  const vars = {
    VERSION: c.version,
    BASE: isRelease ? "release/" : "",                       // asset paths relative to the page
    USERSCRIPT_URL: SITE + c.channel + "/ZineMode.user.js",
    BOOKMARKLET_HREF: esc(bookmarklet),
    BOOKMARKLET_KB: String(Math.round(bookmarklet.length / 1024)),
    NOTES_URL: c.notes,
    BANNER: isRelease ? "" : `<p class="banner">Test version ${esc(c.version)}. It may be unfinished. Installs from this page update from the test channel. <a href="${SITE}" style="color:inherit">Regular version</a></p>`,
    OTHER_CHANNEL: isRelease && hasBeta ? ` · <a href="${SITE}beta/">Test version</a>` : "",
  };
  // Function replacement: the bookmarklet contains "$&"-style sequences a string replacement would expand.
  const html = template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  writeFileSync(isRelease ? OUT + "/index.html" : dir + "/index.html", html);
}
writeFileSync(OUT + "/.nojekyll", "");
console.log("built " + channels.map(c => `${c.channel} ${c.version}`).join(", "));
