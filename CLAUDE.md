# CLAUDE.md — SMC Trading Decision Tree
> Claude Code reads this file automatically when working in this project.
> This is the complete decision framework for Jacky's prop firm challenge.
> Method: Smart Money Concepts (SMC). Instruments: BTC/USDT, ETH/USDT.

---

## MORNING BRIEF — run this every session

When asked to run `morning_brief` or "give me my session bias":

1. Read `rules.json` to load watchlist, bias criteria, and no-trade conditions. **Then run the news gate** — `node scripts/news-gate.js` — for the deterministic economic-calendar verdict (`🟢 CLEAR` / `🚩 NO-TRADE`) plus upcoming high-impact events (CPI, FOMC, NFP…). The verdict is **global**: if NO-TRADE, every symbol inherits a 🚩 news flag and the upcoming events go in the summary. The time-window math is done in code — don't eyeball it. Maintain the calendar in `events.json` (UTC dates).
2. For each symbol in the watchlist, work **top-down (Daily → H4 → H1)**:
   - **HTF CONTEXT FIRST** — use `data_get_multi_timeframe ["D","240","60"]` to read EMA200 + RSI + price summary across Daily, H4 and H1 in one call. Classify each higher timeframe (see `HIGHER-TIMEFRAME CONTEXT` section): Daily trend (bull / bear / range) and H4 trend (bull / bear / range). This is the dashboard the H1 zone sits inside.
   - Switch chart to that symbol on **H1 timeframe** for the detailed read
   - Read EMA200 value and compare to current price
   - Read last 3 swing highs and lows to determine H1 market structure
   - **LIQUIDITY MAP** — from H1 (and H4) OHLCV, identify the obvious liquidity pools: buy-side (BSL) = swing highs / equal highs above price, sell-side (SSL) = swing lows / equal lows below price. Note the nearest pool above and below, and which side price is likely drawn toward (see `LIQUIDITY MAP` section).
   - Identify the nearest unmitigated OB and/or FVG
   - Check RSI value on H1
   - Check if price is in premium, discount, or middle of range
   - **Rate HTF alignment** of the H1 zone: aligned with Daily+H4 (high conviction) / counter-HTF or inside an H4 range (caution — lower conviction)
   - List any active no-trade conditions
3. (HTF data already pulled in step 2 via `data_get_multi_timeframe ["D","240","60"]`)
4. Use `data_get_pine_boxes` to read any OB/FVG zones already drawn by indicators
5. Use `data_get_pine_lines` to read S/R levels
6. **Draw the zones on the chart** — for each symbol, draw the unmitigated OB and FVG aligned with the H1 bias (the ones that matter for entry), following the `DRAWING ZONES ON THE CHART` convention below. Do NOT use `draw_clear` — it wipes the user's own manual drawings too. To avoid duplicates, check `draw_list` first and skip a zone that is already drawn at the same coordinates.
7. Output the brief **in French**, following the French template in the `OUTPUT FORMAT FOR BRIEF` section below.
8. Save the brief (also **in French**) to `Debrief/md/YYYY-MM-DD_HH-MM.md` (create the `Debrief/md/` folder if it does not exist). Use the date AND time from the morning brief — the filename is timestamped (`_HH-MM`) so multiple runs in one day each get their own file. The title heading inside the file must match: `# 📋 Brief de session — YYYY-MM-DD · HH:MM`.
9. **Generate the styled HTML** version: run `node scripts/brief-to-html.js Debrief/md/YYYY-MM-DD_HH-MM.md`. This writes a dark-theme HTML to the sibling folder `Debrief/html/YYYY-MM-DD_HH-MM.html` (red/green badges, styled tables) from the Markdown — do NOT hand-write the HTML. The Markdown is the single source of truth; just re-run the script after any edit to the `.md`. (Layout: `Debrief/md/` holds the `.md` sources, `Debrief/html/` holds the generated `.html`.)

---

## BIAS DETERMINATION (H1 — always first)

```
Price > EMA200 H1 + HH/HL structure + last BOS bullish  →  BULLISH BIAS
Price < EMA200 H1 + LH/LL structure + last BOS bearish  →  BEARISH BIAS
Price ≈ EMA200 H1 OR ranging structure                  →  NEUTRAL → NO TRADE
```

**Never trade against H1 bias.** If bias is neutral, output is: "No valid session setup. Wait."

**HTF overlay (conviction filter, not an override):** the H1 bias still decides direction, but read it inside the Daily/H4 dashboard:
- H1 bias **aligned** with Daily + H4 trend → high conviction, full setup.
- H1 bias **inside an H4 range** (no HTF trend) → tradeable but lower conviction; expect chop and HTF liquidity grabs.
- H1 bias **counter to Daily trend** → caution. Likely just a pullback into HTF liquidity; tighten criteria, smaller target, or skip.

---

## HIGHER-TIMEFRAME CONTEXT (D + H4)

> Read with `data_get_multi_timeframe ["D","240","60"]` (Daily, H4, H1 — requires EMA200 + RSI loaded on the chart). The H1 zone means very different things depending on this dashboard: an H1 OB inside a bearish H4 range ≠ an H1 OB inside a bullish Daily trend.

Classify each timeframe the same way as H1:
```
Price > EMA200 + HH/HL              →  TREND UP
Price < EMA200 + LH/LL              →  TREND DOWN
Price ≈ EMA200 OR no clear HH/HL    →  RANGE (note the range high / low)
```
Then state the **top-down read** in one line, e.g.:
`Daily: trend up | H4: range (3,050–3,180) | H1: bearish pullback → H1 short = counter-Daily, treat as pullback into discount, lower conviction.`

---

## LIQUIDITY MAP (where are the pools?)

> Price is drawn toward resting liquidity. Mapping it tells you where the next sweep (Step 3) is likely to hit and where targets sit. Read from H1 + H4 OHLCV (`data_get_ohlcv --count 150`).

Identify and label:
- **BSL (buy-side liquidity)** — resting above price: obvious swing highs, and especially **equal highs** (two+ highs at ~the same level). Stops of shorts + breakout buy orders sit here.
- **SSL (sell-side liquidity)** — resting below price: obvious swing lows, and **equal lows**. Stops of longs + breakout sell orders sit here.
- **Nearest pool above** and **nearest pool below** the current price (with price levels).
- **Likely draw**: which side price is leaning toward (e.g. equal highs untouched above = magnet for a sweep before a real move down).

How this feeds the setup:
- For a **long**: expect a sweep of SSL (below a swing low / equal lows) into the zone, THEN CHoCH up. The swept low = where stop goes.
- For a **short**: expect a sweep of BSL (above a swing high / equal highs) into the zone, THEN CHoCH down.
- **Targets** = the opposite pool (next liquidity), used for the R/R check.

---

## TRADE SETUP CHECKLIST (run in order — stop at first failure)

```
STEP 1 — BIAS
  ✅ H1 bias is clearly Bullish or Bearish (not neutral)?
  ❌ NEUTRAL → STOP. No trade today on this symbol.

STEP 2 — ZONE
  ✅ Price is at or approaching a valid confluence zone?
     → Tier 1: Unmitigated H1 OB, H1 FVG, or EMA200 H1
     → Tier 2: M15 OB within Tier 1, horizontal S/R, 50% retracement
  ✅ DRAW the zone you are watching as a rectangle (see DRAWING ZONES convention).
  ❌ Price is in the middle of a range → STOP. Wait for edge.

STEP 3 — LIQUIDITY SWEEP
  ✅ Price has swept a pool from the LIQUIDITY MAP at the zone?
     → For longs: wick below the zone taking out SSL (recent swing lows / equal lows)
     → For shorts: wick above the zone taking out BSL (recent swing highs / equal highs)
  ❌ No sweep → STOP. The sweep must come first. Entering without it = chasing.

STEP 4 — CHoCH CONFIRMATION (entry trigger)
  ✅ A CLOSED candle on M5 or M15 has broken the last LH (for longs) or HL (for shorts)?
  ❌ Only a wick touched the level → STOP. Wait for candle close.
  ❌ Still printing → STOP. Wait. Never enter on a live candle.

STEP 5 — R/R CHECK
  ✅ Stop loss placed beyond the sweep wick. Target = opposite pool on the LIQUIDITY MAP (next BSL for longs, next SSL for shorts).
  ✅ R/R ≥ 1:2 ?
  ❌ R/R < 1:2 → SKIP this trade. Move on.

STEP 6 — NO-TRADE FLAGS
  ✅ News gate is 🟢 CLEAR (`node scripts/news-gate.js`)? No high-impact event in the ±window.
  ✅ None of the other no-trade conditions in rules.json are active?
  ❌ Any flag active (🚩 news gate NO-TRADE, RSI extreme, counter-trend) → SKIP or wait.

→ ALL 6 STEPS PASS = Valid setup. Entry on next candle open after CHoCH close.
  → When valid, draw the trade with `draw_position` (direction, entry_price, stop_loss, take_profit)
    so entry / SL / TP are visible on the chart with the R/R.
```

---

## DRAWING ZONES ON THE CHART (OB / FVG / ENTRY)

> Goal: every OB and FVG that matters for the entry must be **visible on the chart**, not just described in text. Use the real `draw_*` MCP tools — never invent a tool.

**Tool:** `draw_shape` with `shape: "rectangle"`. A rectangle needs two opposite corners:
- `point`  = `{ time: <left_edge_unix>, price: <zone_top> }`
- `point2` = `{ time: <right_edge_unix>, price: <zone_bottom> }`
- `left_edge_unix`  = unix time of the candle where the zone was created (its open time).
- `right_edge_unix` = the latest visible bar time (so the box extends to "now"). Get bar times from `data_get_ohlcv`.
- `text` = short label, e.g. `"H1 Bull OB"`, `"H1 Bear FVG"`.
- `overrides` = JSON **string** of style. Keys: `color` (border), `backgroundColor`, `fillBackground`, `transparency` (0–100, higher = more see-through), `linewidth`, `showLabel`, `textcolor`.

**Color convention (keep it consistent every run):**

| Zone | color / backgroundColor | transparency |
|------|-------------------------|--------------|
| Bullish OB  | `#26a69a` (green) | 80 |
| Bearish OB  | `#ef5350` (red)   | 80 |
| Bullish FVG | `#2962ff` (blue)  | 85 |
| Bearish FVG | `#ff9800` (orange)| 85 |

Example overrides string for a bullish OB:
`'{"color":"#26a69a","backgroundColor":"#26a69a","fillBackground":true,"transparency":80,"linewidth":1,"showLabel":true,"text":"H1 Bull OB","textcolor":"#26a69a"}'`

**Rules for drawing:**
- Only draw **unmitigated** zones aligned with the H1 bias — the ones price could actually trade from. Don't clutter the chart with every gap.
- **Never use `draw_clear`** — it deletes the user's own manual drawings. To avoid piling up duplicates, call `draw_list` first and skip any zone already drawn at the same coordinates. If you must remove a box you drew earlier, remove it individually with `draw_remove_one` using its `entity_id`.
- Prefer zones already reported by `data_get_pine_boxes` (indicator-drawn) — match their coordinates rather than re-deriving when possible.
- When a full setup is valid (all 6 steps pass), add the trade with `draw_position`.

---

## KEY RULES — never override these

- **No CHoCH = No trade.** Price touching a zone is NOT a signal.
- **No entry on a wick.** Candle body must close beyond the CHoCH level.
- **No counter-trend trades.** H1 bias is the filter. Always.
- **No trading during major news.** Run `node scripts/news-gate.js` before every session — a 🚩 NO-TRADE verdict means a high-impact event is in the ±window. Keep `events.json` up to date.
- **BTC leads ETH.** If BTC is at a major level, factor that into any ETH setup.
- **"No trade" is a valid decision.** Protecting capital > forcing setups.
- **FOMO is the enemy.** If the move has started without a confirmed CHoCH, it's gone. Wait for the next setup.

---

## TOOL SEQUENCE FOR ANALYSIS

```
tv_health_check                    → verify connection
node scripts/news-gate.js          → economic-calendar gate (🟢 CLEAR / 🚩 NO-TRADE + upcoming)
tv symbol VANTAGE:BTCUSD           → switch symbol
tv timeframe 1H                    → set H1
data_get_multi_timeframe [D,240,60] → top-down HTF context (Daily + H4 + H1 dashboard)
data_get_study_values EMA(200)     → read EMA200
data_get_ohlcv --count 150         → read price action + map liquidity (swing/equal highs & lows)
data_get_pine_boxes                → read OB/FVG zones from indicators
data_get_pine_lines                → read S/R levels
data_detect_candlestick_patterns   → candle context (supplemental only)
draw_list                          → check existing drawings (avoid duplicates; never draw_clear)
draw_shape rectangle               → draw OB / FVG zones (see DRAWING ZONES convention)
draw_position                      → draw entry / SL / TP when a setup is valid
capture_screenshot                 → visual confirmation
```

---

## OUTPUT FORMAT FOR BRIEF

> **LANGUE : le brief doit être rédigé EN FRANÇAIS** — aussi bien la sortie affichée à l'écran que le fichier sauvegardé dans `Debrief/`. Les sigles SMC restent tels quels (BOS, CHoCH, OB, FVG, EMA200, RSI, R/R, HH/HL, LH/LL).
>
> **FORMAT : vrai Markdown** (titres `#`, tableaux, gras, `>` citations, ``code`` pour les prix). Le fichier `Debrief/*.md` doit s'afficher proprement dans l'aperçu Markdown de VS Code — PAS un bloc de texte brut entre ``` ```. Suis exactement le gabarit ci-dessous (rends une section par symbole de la watchlist).

**Légende des badges** (à réutiliser tels quels) :
`🟢` haussier · `🔴` baissier · `⚪` neutre · `🔺` au-dessus EMA · `🔻` sous EMA · `🔼` BSL/liquidité au-dessus · `🔽` SSL/liquidité en-dessous · `⏳` aucun setup (attendre) · `✅` setup valide · `🚩` drapeau no-trade

**`[SESSION]`** = session de marché active à `[HEURE]` (heure locale Paris). Valeurs (mêmes bornes que `scripts/brief-to-html.js`) :
`🌏 Asie / Tokyo` (01:00–08:00) · `🇫🇷 Paris Open` (08:00–09:00) · `🇬🇧 London` (09:00–14:30) · `🌍 London/NY overlap` (14:30–17:30) · `🇺🇸 New York` (17:30–22:00) · `🌙 Clôture US / nuit` (22:00–01:00).
Dans le HTML, le script affiche automatiquement cette session sous forme de vignette colorée à droite du titre (recalculée depuis l'heure) — tu peux donc l'écrire dans le titre MD, elle ne sera pas dupliquée.

```markdown
# 📋 Brief de session — [DATE] · [HEURE] · [SESSION]

> **Global :** [🟢/🔴/⚪] [Aligné haussier / Aligné baissier / Mixte / Aucun setup] · **Top opportunité :** [symbole + direction, ou AUCUNE]
> _Pas de CHoCH = Pas de trade. Protéger le compte._

---

## [🟢/🔴/⚪] BTCUSD — Biais : **[Haussier/Baissier/Neutre]**

| Élément | Lecture |
|---|---|
| **Contexte HTF** | Daily [↗/↘/range] · H4 [↗/↘/range (`high`–`low`)] → [aligné HTF / contre-Daily / dans range H4] |
| **EMA200 H1** | [🔺/🔻] prix [au-dessus/sous] l'EMA `[valeur]` (prix ≈ `[valeur]`) |
| **Structure** | [HH/HL · LH/LL · Range] — [BOS note] |
| **Liquidité** | 🔼 BSL `[niveau]` [equal highs ?] · 🔽 SSL `[niveau]` [equal lows ?] · aimant : [haut/bas] |
| **Zone clé** | `[prix–prix]` — [OB/FVG/S&R/EMA] |
| **Type de zone** | [Premium / Discount / Milieu] |
| **RSI H1** | `[valeur]` |

**Setup :** [⏳ AUCUN — _WAIT [LONG/SHORT]_ ... / ✅ description] 
**No-trade :** [🚩 liste ou AUCUN]

---

## [🟢/🔴/⚪] ETHUSD — Biais : **[Haussier/Baissier/Neutre]**

| Élément | Lecture |
|---|---|
| **Contexte HTF** | Daily [↗/↘/range] · H4 [↗/↘/range (`high`–`low`)] → [alignement] |
| **EMA200 H1** | [🔺/🔻] prix [au-dessus/sous] l'EMA `[valeur]` (prix ≈ `[valeur]`) |
| **Structure** | [HH/HL · LH/LL · Range] — [BOS note] |
| **Liquidité** | 🔼 BSL `[niveau]` [equal highs ?] · 🔽 SSL `[niveau]` [equal lows ?] · aimant : [haut/bas] |
| **Zone clé** | `[prix–prix]` — [OB/FVG/S&R/EMA] |
| **Type de zone** | [Premium / Discount / Milieu] |
| **RSI H1** | `[valeur]` |
| **Corrélation BTC** | [alignée / divergente — note] |

**Setup :** [⏳ AUCUN — _WAIT [LONG/SHORT]_ ... / ✅ description] 
**No-trade :** [🚩 liste ou AUCUN]

---

## 🧭 Résumé

- **Global :** [🟢/🔴/⚪] [...]
- **Meilleure opportunité :** [symbole + direction + « attendre le CHoCH après sweep en `[zone]` » / AUCUNE]
- **Rappel :** Pas de CHoCH = Pas de trade. Attendre le setup, pas le mouvement.
```

---

## DEFINITIONS QUICK REFERENCE

| Term | Definition |
|------|-----------|
| **BOS** | Break of Structure — confirms trend continuation |
| **CHoCH** | Change of Character — entry trigger (closed candle only) |
| **OB** | Order Block — last opposite candle before impulse (must be unmitigated) |
| **FVG** | Fair Value Gap — 3-candle imbalance / unfilled inefficiency |
| **Liquidity sweep** | Price engineered to take stops before reversing — expected, not feared |
| **Premium** | Price above 50% of the last impulse — look for shorts |
| **Discount** | Price below 50% of the last impulse — look for longs |
| **Unmitigated** | Zone price has NOT returned to since it was created |

## APRÈS LE BRIEF — dessiner sur le chart

Pour chaque symbole analysé, dessiner automatiquement :

1. **OB identifié** → rectangle coloré
   - Bearish OB : rectangle rouge semi-transparent
   - Bullish OB : rectangle vert semi-transparent

2. **FVG identifié** → rectangle bleu semi-transparent entre les deux prix

3. **Zone d'entrée** → ligne horizontale pointillée orange au niveau Fib (0.5 / 0.618 / 0.786)

4. **EMA200 H1** → ligne horizontale blanche avec label "EMA200 H1"

5. **Label setup** → texte sur le chart : "WAIT SHORT — CHoCH M5/M15" ou "NO SETUP"

Utiliser : drawing_create_rectangle, drawing_create_horizontal_line, drawing_create_label