#!/usr/bin/env node
/**
 * brief-to-html.js — convert a Debrief Markdown file into a styled, dark-theme,
 * self-contained HTML file (same name, .html extension) in the same folder.
 *
 * Usage:
 *   node scripts/brief-to-html.js Debrief/2026-06-20.md
 *   node scripts/brief-to-html.js            # defaults to Debrief/<today>.md
 *
 * Dependency-free. Tailored to the brief template in CLAUDE.md (headings,
 * blockquotes, tables, lists, **bold**, _italic_, `code`, --- rules) but
 * tolerant of generic Markdown.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';

// ---------- inline formatting ----------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text) {
  let s = escapeHtml(text);
  // `code`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // **bold**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // _italic_ (avoid matching inside words like swing_low — require boundaries)
  s = s.replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>');
  return s;
}

// Trading-session vignette from a HH:MM (heure locale Paris). Crypto = 24/7,
// mais on affiche la session FX/equity de référence active à cette heure.
function sessionInfo(hh, mm) {
  const t = hh * 60 + mm;
  const at = (h, m = 0) => h * 60 + m;
  if (t >= at(1) && t < at(8))           return { label: 'Asie / Tokyo',       emoji: '🌏', cls: 'sess-asia' };
  if (t >= at(8) && t < at(9))           return { label: 'Paris Open',         emoji: '🇫🇷', cls: 'sess-paris' };
  if (t >= at(9) && t < at(14, 30))      return { label: 'London',             emoji: '🇬🇧', cls: 'sess-london' };
  if (t >= at(14, 30) && t < at(17, 30)) return { label: 'London/NY overlap',  emoji: '🌍', cls: 'sess-overlap' };
  if (t >= at(17, 30) && t < at(22))     return { label: 'New York',           emoji: '🇺🇸', cls: 'sess-ny' };
  return { label: 'Clôture US / nuit', emoji: '🌙', cls: 'sess-night' };
}

// Build the chip HTML from a title that contains a HH:MM, or '' if no time found.
function sessionChip(titleText) {
  const tm = titleText.match(/(\d{1,2}):(\d{2})/);
  if (!tm) return '';
  const s = sessionInfo(+tm[1], +tm[2]);
  return `<span class="session ${s.cls}">${s.emoji} ${escapeHtml(s.label)}</span>`;
}

// Color word badges (bias / status). Returns a styled pill or null.
function biasBadge(word) {
  const w = word.toLowerCase();
  if (/(haussier|aligné haussier|bull)/.test(w)) return `<span class="badge badge-green">${escapeHtml(word)}</span>`;
  if (/(baissier|aligné baissier|bear)/.test(w)) return `<span class="badge badge-red">${escapeHtml(word)}</span>`;
  if (/(neutre|mixte|range|aucun)/.test(w)) return `<span class="badge badge-grey">${escapeHtml(word)}</span>`;
  return null;
}

// ---------- block parsing ----------
function convert(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isSepRow = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');

  while (i < lines.length) {
    let line = lines[i];

    // blank
    if (/^\s*$/.test(line)) { i++; continue; }

    // horizontal rule
    if (/^\s*---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // headings
    let h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      let content = h[2].trim();
      // Special: "# 📋 Brief de session — DATE · HH:MM[ · Session]" → titre + vignette session à droite.
      if (level === 1 && /\d{1,2}:\d{2}/.test(content)) {
        // Garde tout jusqu'à l'heure HH:MM ; ignore un éventuel "· Session" déjà écrit (recalculé ici).
        const mt = content.match(/^(.*?\d{1,2}:\d{2})(?:\s*·.*)?$/);
        const mainText = mt ? mt[1] : content;
        const chip = sessionChip(mainText);
        out.push(`<h1>${inline(mainText)}${chip ? ' ' + chip : ''}</h1>`);
        i++; continue;
      }
      // Special: "## <emoji> SYMBOL — Biais : **Word**"
      const biasMatch = content.match(/^(.*?)\s*—\s*Biais\s*:\s*\*\*(.+?)\*\*\s*$/i);
      if (level === 2 && biasMatch) {
        const left = inline(biasMatch[1]);
        const badge = biasBadge(biasMatch[2]) || inline(biasMatch[2]);
        out.push(`<h2 class="symbol">${left} ${badge}</h2>`);
      } else {
        out.push(`<h${level}>${inline(content)}</h${level}>`);
      }
      i++; continue;
    }

    // blockquote (group consecutive > lines)
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    // table
    if (isTableRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const header = cells(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
      let t = '<table><thead><tr>';
      t += header.map((c) => `<th>${inline(c)}</th>`).join('');
      t += '</tr></thead><tbody>';
      for (const r of rows) {
        t += '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
      }
      t += '</tbody></table>';
      out.push(t);
      continue;
    }

    // list (group consecutive - items)
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push('<ul>' + items.map((it) => `<li>${inline(it)}</li>`).join('') + '</ul>');
      continue;
    }

    // paragraph (group until blank / block start)
    const para = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*(#{1,4}\s|>|---+\s*$|[-*]\s)/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }

  return out.join('\n');
}

// ---------- emoji → subtle colored spans (badges keep their dot) ----------
function colorEmoji(html) {
  const map = {
    '🟢': 'e-green', '🔺': 'e-green', '🔼': 'e-green', '✅': 'e-green',
    '🔴': 'e-red', '🔻': 'e-red', '🔽': 'e-red', '🚩': 'e-red',
    '⚪': 'e-grey', '⏳': 'e-amber',
  };
  for (const [emo, cls] of Object.entries(map)) {
    html = html.split(emo).join(`<span class="${cls}">${emo}</span>`);
  }
  return html;
}

// ---------- page shell ----------
function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg:#0d1117; --panel:#161b22; --panel2:#1c2330; --border:#30363d;
    --text:#c9d1d9; --muted:#8b949e; --head:#f0f6fc;
    --green:#3fb950; --green-bg:#23863622; --red:#f85149; --red-bg:#da363322;
    --grey:#8b949e; --grey-bg:#6e768166; --amber:#d29922; --accent:#58a6ff;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; padding:32px 18px 64px; background:var(--bg); color:var(--text);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap { max-width:860px; margin:0 auto; }
  h1 { color:var(--head); font-size:26px; margin:0 0 18px; padding-bottom:14px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  h2 { color:var(--head); font-size:20px; margin:34px 0 12px; }
  h2.symbol { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  h3 { color:var(--head); font-size:16px; margin:24px 0 10px; }
  hr { border:0; border-top:1px solid var(--border); margin:26px 0; }
  p { margin:10px 0; }
  a { color:var(--accent); }
  code { background:#6e768122; color:#79c0ff; padding:1px 6px; border-radius:5px; font:13px/1.4 "SF Mono",Consolas,"Liberation Mono",monospace; }
  blockquote {
    margin:0 0 18px; padding:12px 16px; background:var(--panel);
    border-left:3px solid var(--accent); border-radius:6px; color:var(--text);
  }
  table { width:100%; border-collapse:collapse; margin:8px 0 16px; background:var(--panel); border-radius:8px; overflow:hidden; }
  th, td { text-align:left; padding:9px 14px; border-bottom:1px solid var(--border); vertical-align:top; }
  thead th { background:var(--panel2); color:var(--muted); font-size:13px; text-transform:uppercase; letter-spacing:.04em; }
  tbody tr:last-child td { border-bottom:0; }
  tbody td:first-child { color:var(--head); font-weight:600; white-space:nowrap; width:160px; }
  ul { margin:10px 0; padding-left:22px; }
  li { margin:6px 0; }
  .badge { display:inline-block; padding:2px 12px; border-radius:999px; font-size:14px; font-weight:700; }
  .badge-green { color:var(--green); background:var(--green-bg); border:1px solid #2386364d; }
  .badge-red { color:var(--red); background:var(--red-bg); border:1px solid #da36334d; }
  .badge-grey { color:var(--grey); background:var(--grey-bg); border:1px solid #6e768166; }
  .e-green { color:var(--green); } .e-red { color:var(--red); }
  .e-grey { color:var(--grey); } .e-amber { color:var(--amber); }
  .session { font-size:13px; font-weight:700; padding:4px 14px; border-radius:999px; white-space:nowrap;
             border:1px solid var(--border); background:var(--panel2); color:var(--muted); }
  .sess-overlap { color:#f0b429; background:#d2992222; border-color:#d2992255; }
  .sess-london  { color:#58a6ff; background:#1f6feb22; border-color:#1f6feb55; }
  .sess-ny      { color:#3fb950; background:#23863622; border-color:#23863655; }
  .sess-paris   { color:#bc8cff; background:#8957e522; border-color:#8957e555; }
  .sess-asia, .sess-night { color:#8b949e; background:#6e768122; }
  strong { color:var(--head); }
  .footer { margin-top:40px; color:var(--muted); font-size:12px; text-align:center; }
</style>
</head>
<body>
  <div class="wrap">
${bodyHtml}
    <div class="footer">Généré depuis le Markdown · thème sombre · ne pas trader sans CHoCH confirmé</div>
  </div>
</body>
</html>
`;
}

// ---------- main ----------
function todayPath() {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hm = `${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
  return join('Debrief', 'md', `${iso}_${hm}.md`);
}

const arg = process.argv[2];
const mdPath = resolve(arg || todayPath());

if (!existsSync(mdPath)) {
  console.error(`✗ Markdown introuvable : ${mdPath}`);
  console.error('Usage: node scripts/brief-to-html.js [Debrief/YYYY-MM-DD.md]');
  process.exit(1);
}

const md = readFileSync(mdPath, 'utf8');
const titleMatch = md.match(/^#\s+(.*)$/m);
const title = titleMatch ? titleMatch[1].replace(/[📋🧭]/g, '').trim() : basename(mdPath, '.md');

const body = colorEmoji(convert(md))
  .split('\n').map((l) => '    ' + l).join('\n');

// HTML lands in a sibling html/ folder: Debrief/md/foo.md -> Debrief/html/foo.html
const mdDir = dirname(mdPath);
const htmlDir = basename(mdDir) === 'md' ? join(mdDir, '..', 'html') : join(mdDir, 'html');
mkdirSync(htmlDir, { recursive: true });
const htmlPath = join(htmlDir, basename(mdPath, '.md') + '.html');
writeFileSync(htmlPath, page(title, body), 'utf8');
console.log(`✓ HTML écrit : ${htmlPath}`);
