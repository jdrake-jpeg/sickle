// Builds the public sicklepickle.app site into site/: a home page plus the
// privacy policy and terms, from the same text the app shows
// (constants/legal.json). Cloudflare Pages serves site/ as is.
//
//   npm run build:site
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const legal = JSON.parse(fs.readFileSync(path.join(root, 'constants/legal.json'), 'utf8'));
const out = path.join(root, 'site');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const page = (title, description, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Saira:ital,wght@1,800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #F6F1E4; --surface: #FFFFFF; --border: #E0D9C6; --text: #0B0B0B; --muted: #666157; --accent: #4A6500;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0B0B0B; --surface: #161616; --border: #262626; --text: #F6F1E4; --muted: #A29E94; --accent: #D7FF3F; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.55 Barlow, system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  h1, h2 { font-family: Saira, system-ui, sans-serif; font-style: italic; font-weight: 800; letter-spacing: -0.3px; line-height: 1.15; }
  h1 { font-size: 34px; margin: 8px 0 4px; }
  h2 { font-size: 18px; text-transform: uppercase; margin: 0 0 8px; }
  a { color: var(--accent); font-weight: 600; }
  nav { display: flex; gap: 20px; align-items: center; margin-bottom: 24px; }
  nav .home { margin-right: auto; font-family: Saira, sans-serif; font-style: italic; font-weight: 800; font-size: 20px; color: var(--text); text-decoration: none; }
  .muted { color: var(--muted); }
  section { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 18px 20px; margin: 16px 0; }
  ul { margin: 0; padding-left: 20px; }
  li { margin: 6px 0; }
  li::marker { color: var(--accent); }
  .hero { text-align: center; padding-top: 24px; }
  .hero img { width: min(420px, 100%); height: auto; }
  .tagline { font-size: 20px; margin: 16px 0 8px; }
  footer { margin-top: 40px; font-size: 15px; }
</style>
</head>
<body>
<main>
<nav><a class="home" href="/">SICKLE</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
${body}
<footer class="muted">Questions? Email <a href="mailto:${legal.supportEmail}">${legal.supportEmail}</a>.</footer>
</main>
</body>
</html>
`;

const legalPage = (title, doc) =>
  page(
    `${title} · Sickle`,
    doc.intro,
    `<h1>${esc(title)}</h1>
<p class="muted">Last updated ${esc(doc.updated)}</p>
<p>${esc(doc.intro)}</p>
${doc.sections
  .map(
    (s) => `<section id="${slug(s.title)}">
<h2>${esc(s.title)}</h2>
<ul>
${s.points.map((p) => `<li>${esc(p)}</li>`).join('\n')}
</ul>
</section>`,
  )
  .join('\n')}`,
  );

const home = page(
  'Sickle',
  'Pickleball in Rexburg. Find a partner nearby, challenge up, take the crown.',
  `<div class="hero">
<img src="logo.png" alt="Sickle Pickle logo" width="900" height="604">
<p class="tagline">Find a partner nearby. Challenge up. Take the crown.</p>
<p class="muted">Doubles pickleball for Rexburg and BYU-Idaho: teams, challenges, scores both teams agree on, and a leaderboard for every court. Coming soon to iPhone and Android.</p>
</div>`,
);

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), home);
fs.writeFileSync(path.join(out, 'privacy.html'), legalPage('Privacy policy', legal.privacy));
fs.writeFileSync(path.join(out, 'terms.html'), legalPage('Terms of use', legal.terms));
fs.copyFileSync(path.join(root, 'assets/images/logo-full.png'), path.join(out, 'logo.png'));
fs.copyFileSync(path.join(root, 'assets/images/favicon.png'), path.join(out, 'favicon.png'));
console.log('Built site/: index.html, privacy.html, terms.html');
