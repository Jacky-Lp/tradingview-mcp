#!/usr/bin/env node
/**
 * news-gate.js — deterministic economic-calendar gate for the morning brief.
 *
 * Reads a user-maintained `events.json` (high-impact macro events: CPI, FOMC,
 * NFP, ...) and answers ONE question the brief needs: is price near a scheduled
 * high/medium-impact event RIGHT NOW (or at a given time)? If so → 🚩 NO-TRADE.
 * It also lists upcoming events in the next few hours so the brief can warn.
 *
 * The time-window math is done here (in code), NOT eyeballed by Claude — so the
 * no-trade flag is reproducible. Claude just reads the verdict.
 *
 * Usage:
 *   node scripts/news-gate.js                       # check at "now"
 *   node scripts/news-gate.js --at 2026-06-22T14:30:00Z   # check at a given UTC time
 *   node scripts/news-gate.js --window 45           # override block window (minutes)
 *   node scripts/news-gate.js --lookahead 24        # upcoming-events horizon (hours)
 *   node scripts/news-gate.js --json                # machine-readable output
 *   node scripts/news-gate.js --file path/events.json
 *
 * Exit code is always 0 (advisory tool). Verdict is in stdout: CLEAR / NO_TRADE / UNKNOWN.
 *
 * Dependency-free. Events are stored in UTC (ISO 8601 with `Z`).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------- args ----------
function parseArgs(argv) {
  const a = { at: null, window: null, lookahead: null, json: false, file: 'events.json' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k === '--at') a.at = argv[++i];
    else if (k === '--window') a.window = Number(argv[++i]);
    else if (k === '--lookahead') a.lookahead = Number(argv[++i]);
    else if (k === '--file') a.file = argv[++i];
  }
  return a;
}

// ---------- formatting helpers ----------
const PARIS = 'Europe/Paris';
function fmt(d, tz) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}
function humanDelta(mins) {
  const m = Math.round(mins);
  if (m === 0) return "maintenant";
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const r = abs % 60;
  const span = h > 0 ? `${h}h${String(r).padStart(2, '0')}` : `${r} min`;
  return m > 0 ? `dans ${span}` : `il y a ${span}`;
}

function windowFor(impact, cfg, override) {
  if (override != null) return override;
  if (impact === 'high') return cfg.high_impact_window_min ?? 30;
  if (impact === 'medium') return cfg.medium_impact_window_min ?? 15;
  return 0; // low impact never blocks
}

// ---------- main ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = args.at ? new Date(args.at) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`--at invalide : "${args.at}" (attendu ISO, ex: 2026-06-22T14:30:00Z)`);
    process.exit(0);
  }

  const file = resolve(process.cwd(), args.file);
  if (!existsSync(file)) {
    const msg = `⚠️  ${args.file} introuvable — gating news DÉSACTIVÉ. Vérifie le calendrier éco à la main.`;
    if (args.json) console.log(JSON.stringify({ verdict: 'UNKNOWN', reason: 'no events file', file }, null, 2));
    else console.log(msg);
    process.exit(0);
  }

  let cfg;
  try {
    cfg = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`❌ ${args.file} illisible (JSON invalide) : ${e.message}`);
    process.exit(0);
  }

  const lookaheadH = args.lookahead ?? cfg.lookahead_hours ?? 12;
  const events = Array.isArray(cfg.events) ? cfg.events : [];

  const active = [];   // currently inside a block window
  const upcoming = []; // future, within lookahead, but not yet blocking

  for (const ev of events) {
    const t = new Date(ev.datetime);
    if (Number.isNaN(t.getTime())) continue;
    const win = windowFor(ev.impact, cfg, args.window);
    const deltaMin = (t.getTime() - now.getTime()) / 60000;
    const inBlock = win > 0 && deltaMin >= -win && deltaMin <= win;
    const row = {
      name: ev.name, impact: ev.impact, currency: ev.currency || '',
      datetime: t.toISOString(), window_min: win,
      delta_min: Math.round(deltaMin),
      utc: fmt(t, 'UTC'), paris: fmt(t, PARIS),
      example: !!ev.example,
    };
    if (inBlock) active.push(row);
    else if (deltaMin > 0 && deltaMin <= lookaheadH * 60) upcoming.push(row);
  }
  active.sort((a, b) => Math.abs(a.delta_min) - Math.abs(b.delta_min));
  upcoming.sort((a, b) => a.delta_min - b.delta_min);

  const verdict = active.length ? 'NO_TRADE' : 'CLEAR';

  if (args.json) {
    console.log(JSON.stringify({
      verdict, checked_at: now.toISOString(),
      checked_at_paris: fmt(now, PARIS),
      lookahead_hours: lookaheadH, active, upcoming,
    }, null, 2));
    return;
  }

  // human-readable (French, drops straight into the brief)
  const lines = [];
  lines.push(`🕐 Heure du check : ${fmt(now, PARIS)} (Paris) · ${fmt(now, 'UTC')} UTC`);
  if (verdict === 'NO_TRADE') {
    lines.push(`🚩 VERDICT : NO-TRADE — événement à fort impact dans la fenêtre`);
    for (const e of active) {
      lines.push(`   → ${e.name} (${e.impact}${e.currency ? ', ' + e.currency : ''}) ${humanDelta(e.delta_min)} · ±${e.window_min} min`);
    }
  } else {
    lines.push(`🟢 VERDICT : CLEAR — aucun événement bloquant en ce moment`);
  }
  if (upcoming.length) {
    lines.push(`📅 À venir (${lookaheadH}h) :`);
    for (const e of upcoming) {
      lines.push(`   • ${e.paris} (Paris) — ${e.name} (${e.impact}${e.currency ? ', ' + e.currency : ''}) ${humanDelta(e.delta_min)}${e.example ? '  [exemple]' : ''}`);
    }
  } else if (verdict === 'CLEAR') {
    lines.push(`📅 Aucun événement programmé dans les ${lookaheadH} prochaines heures.`);
  }
  console.log(lines.join('\n'));
}

main();
