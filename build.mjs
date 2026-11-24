// Builds the NurseNova link pages for GitHub Pages from the live site's sitemap and public list.
// Only pages listed in the sitemap are linked (public, released decks), so nothing private ever appears.
// No dependencies: Node 20+. Output: ./site
import { mkdir, writeFile } from 'node:fs/promises';

const SITE = (process.env.SITE_URL || 'https://nursenova.duckdns.org').replace(/\/$/, '');
const PAGES = (process.env.PAGES_URL || 'https://nursenova.github.io').replace(/\/$/, '');
const OUT = 'site';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (s, n = 180) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, t.lastIndexOf(' ', n) > 80 ? t.lastIndexOf(' ', n) : n) + '…' : t;
};
async function get(url, type = 'json') {
  const r = await fetch(url, { headers: { 'User-Agent': 'nursenova-pages-builder' } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return type === 'json' ? r.json() : r.text();
}

const sitemap = await get(`${SITE}/sitemap.xml`, 'text');
const listed = new Map([...sitemap.matchAll(/<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => [m[1], m[2] ?? '']));
const categories = await get(`${SITE}/api/v1/categories`);

const decks = [];
for (let page = 1; page < 50; page++) {
  const r = await get(`${SITE}/api/v1/presentations?page=${page}&pageSize=60&sort=newest`);
  decks.push(...r.items);
  if (page * r.pageSize >= r.total || r.items.length === 0) break;
}
const live = decks.filter((d) => listed.has(`${SITE}/p/${d.slug}`));
if (live.length === 0) throw new Error('No public presentations found: refusing to publish an empty site.');
const bySubject = new Map();
for (const d of live) {
  const key = d.categorySlug || 'general-other';
  if (!bySubject.has(key)) bySubject.set(key, []);
  bySubject.get(key).push(d);
}
const subjects = categories.filter((c) => bySubject.has(c.slug));
const authors = new Map(live.map((d) => [d.author.id, d.author.displayName]));
const updated = new Date().toISOString().slice(0, 10);

const css = `:root{--bg:#f6faf9;--surface:#fff;--text:#12302b;--muted:#4b625d;--primary:#0f766e;--border:#d5e4e1}
@media (prefers-color-scheme:dark){:root{--bg:#0b1513;--surface:#12201d;--text:#e3efec;--muted:#9db3ae;--primary:#5eead4;--border:#24403a}}
*{box-sizing:border-box;overflow-wrap:anywhere}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}a{color:var(--primary)}a:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
header p,footer,.muted{color:var(--muted)}h1{font-size:1.8rem;line-height:1.25;margin:.2em 0}h2{font-size:1.25rem;margin-top:2em}
.cta{display:inline-block;margin:8px 0;padding:10px 18px;border-radius:8px;background:var(--primary);color:var(--bg);text-decoration:none;font-weight:600}
ul.decks{list-style:none;padding:0}ul.decks li{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin:10px 0}
ul.decks a{font-weight:600}ul.decks p{margin:4px 0 0;font-size:.93rem;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.chips a{display:inline-block;padding:6px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);text-decoration:none}
footer{margin-top:40px;font-size:.9rem;border-top:1px solid var(--border);padding-top:16px}`;

const layout = ({ title, description, path, body }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${PAGES}${path}"><style>${css}</style></head>
<body><main>${body}
<footer>NurseNova is a free nursing education library for nursing students and faculty in India.
Open the full library at <a href="${SITE}/">${esc(SITE.replace(/^https?:\/\//, ''))}</a> ·
<a href="${SITE}/about">About</a> · <a href="${SITE}/faq">FAQ</a> · <a href="${SITE}/contact">Contact</a>. List updated ${updated}.</footer>
</main></body></html>`;

const deckList = (list) => `<ul class="decks">${list.map((d) => `<li><a href="${SITE}/p/${esc(d.slug)}">${esc(d.title)}</a>
<p>${esc([d.slideCount ? `${d.slideCount} slides` : '', d.category, d.author?.displayName ? `by ${d.author.displayName}` : ''].filter(Boolean).join(' · '))}${d.locked || d.visibility === 'Unlisted' ? ' · Members only (free membership)' : ''}</p>
${short(d.description) ? `<p>${esc(short(d.description))}</p>` : ''}</li>`).join('\n')}</ul>`;

await mkdir(`${OUT}/subjects`, { recursive: true });

const home = layout({
  title: 'NurseNova – Free nursing presentations by subject',
  description: `Free nursing lecture presentations for GNM, B.Sc and M.Sc Nursing students, organised by subject: ${subjects.map((s) => s.name).join(', ')}.`,
  path: '/',
  body: `<header><h1>NurseNova: free nursing presentations, organised by subject</h1>
<p>Lecture slides shared by nursing faculty for GNM, B.Sc Nursing and M.Sc Nursing students. Read them slide by slide on any phone, make notes and practise with quiz questions.</p>
<a class="cta" href="${SITE}/explore">Browse the library on NurseNova</a></header>
<h2>Subjects</h2><ul class="chips">${subjects.map((s) => `<li><a href="subjects/${esc(s.slug)}.html">${esc(s.name)} (${bySubject.get(s.slug).length})</a></li>`).join('')}</ul>
${listed.has(`${SITE}/courses`) ? `<p><a href="${SITE}/courses">Courses</a>: several presentations to study in order, e.g. a semester module.</p>` : ''}
<h2>Latest presentations</h2>${deckList(live.slice(0, 20))}
${authors.size ? `<h2>Educators</h2><ul class="chips">${[...authors].filter(([id]) => listed.has(`${SITE}/u/${id}`)).map(([id, name]) => `<li><a href="${SITE}/u/${esc(id)}">${esc(name)}</a></li>`).join('')}</ul>` : ''}`,
});
await writeFile(`${OUT}/index.html`, home);

for (const s of subjects) {
  const list = bySubject.get(s.slug);
  await writeFile(`${OUT}/subjects/${s.slug}.html`, layout({
    title: `${s.name} nursing presentations – NurseNova`,
    description: `${list.length} free ${s.name} presentations for nursing students: ${list.slice(0, 5).map((d) => d.title).join(', ')}.`,
    path: `/subjects/${s.slug}.html`,
    body: `<p><a href="../">← All subjects</a></p><header><h1>${esc(s.name)} presentations</h1>
<p>${list.length} ${s.name} presentation${list.length === 1 ? '' : 's'} for nursing students on NurseNova.</p>
<a class="cta" href="${SITE}/explore?category=${esc(s.slug)}">Open ${esc(s.name)} on NurseNova</a></header>${deckList(list)}`,
  }));
}

const urls = ['/', ...subjects.map((s) => `/subjects/${s.slug}.html`)];
await writeFile(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${PAGES}${u}</loc><lastmod>${updated}</lastmod></url>`).join('\n')}\n</urlset>\n`);
await writeFile(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${PAGES}/sitemap.xml\n`);
await writeFile(`${OUT}/.nojekyll`, '');
console.log(`Built ${urls.length} pages linking ${live.length} presentations in ${subjects.length} subjects.`);
