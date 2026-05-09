# Ideas & Backlog

Improvements tracked but not yet implemented.

## Recently shipped (kept for context, dated)

- **2026-04-25** — B.18 `pane_read_batch` (ttnsx888 668cc55d): self-contained additive port, format helpers duplicated rather than refactored to avoid conflict.
- **2026-04-25** — `pine_smart_compile` exposes `elapsed_ms` so callers know how long compilation took.
- **2026-04-25** — `tab_list` includes the active Pine script name per tab (DOM probe via `pine-script-title-button`).
- **2026-04-25** — `tab_switch_by_name`: switch by Pine script name (exact-then-substring match) instead of by index.
- **2026-04-25** — Cycle 1 (6 bugs): `tv_launch` null pid, `pane_read_batch` wrong unwrap path, port param fiction in `ensureCDP`, `watchlist.addBulk` macOS modifier, `paths.resolveScreenshotDir` traversal vector, `pine.saveAs` silent reopen failure. Cycle 2 (3 perf items): page-side cap in `buildGraphicsJS`, dialog selector pre-filter, per-target Pine read timeout. (`fork-port/cycle-1-2-fixes`)
- **2026-04-25** — `stream.js` smoke coverage (10 tests). Added `_deps` to `pollLoop` so iteration count, sleep, signals, and stdout/stderr are injectable. Includes regressions for the `inner.get(false)` unwrap path and study-filter threading.
- **2026-04-25** — Per-call `_deps` DI migration for 10 core modules: alerts, batch, capture, data, health, indicators, pane, pine, ui, watchlist. The global `__setTestOverrides` hook still works as the underlying fallback. (`refactor/wrappers-and-di`)
- **2026-04-25** — E2e wrapper refactor: 37 of 79 raw `evaluate(...CHART_API...)` sites replaced with wrapper calls (`coreChart`, `coreDrawing`, `coreHealth`, `corePine`, `coreData`, `coreUi`, `coreIndicators`). Includes the four "output size budget" tests that were re-implementing wrapper IIFEs verbatim — now they assert the wrapper's actual output, so a TV API rename produces a single-source failure instead of parallel-implementation drift. Down to 42 raw sites; the rest are DOM existence probes, FIND_MONACO walks, or BARS_PATH single-bar reads with no wrapper equivalent. (`refactor/wrappers-and-di`)
- **2026-04-25** — TV Desktop 3.1.0 quirks wiki entry written at `~/ai/wiki/vendors/tradingview-desktop.md` covering API surface changes, state-pollution traps, Pine graphics object path, and launch-path quirks.

## Fork audit 2026-05-09

Sourced from `scripts/audit_forks.sh --top 100` (report at `/tmp/fork_audit.md`).

### Shipped this audit cycle

- **`chart_remove_studies_by_title`** — bulk title-substring removal via `getAllStudies` + `removeEntity`. Saves a `chart_get_state` roundtrip when the caller has the script name but not entity_id. Sourced from prezis (their `pine_remove_study` fix didn't apply directly because our `chart_manage_indicator` already used `removeEntity`, but the title-match capability was a genuine gap).
- **CDP reliability bundle** — `withReconnect()` helper, 2s liveness timeout in `getClient()` with timer cleanup, and `Emulation.setFocusEmulationEnabled` on every (re)attach (so background-tab screenshots keep painting). Sourced from upstream PR #131 + dsfortescue fork (`99cc9c5`).
- **`data_get_strategy_info`** — strategy name (internal API on `metaInfo`) + Strategy Tester date range (DOM scrape). Sourced from PasanteAdmin.
- **EPIPE-on-TV-close fix** — `connect()` no longer calls `Runtime.enable` / `Page.enable` / `DOM.enable`, eliminating the console-event forwarding channel that EPIPEs on TV's renderer at shutdown. `disconnect()` sends `disable` defensively and waits 250 ms for the close frame to flush. `connect()` registers a `disconnect` event handler so the cached client drops immediately when TV closes. `server.js` adds SIGTERM, SIGINT, and stdin-close handlers that route through `disconnectCdp()` before exit. Sourced from PasanteAdmin (`bcd8176` + `cf9785a`).
- **`replay_stop` linking-path fix** — `_replaySessionState` now nulls on `chartWidget._linking._chartWidgetCollection` (the path that survives a TV process restart), not the non-existent `TradingViewApi.linking`. Surfaced this session.

### Audited, no genuine gap

- **KarmicP — CDP injection sanitization across 9 modules.** Our `tests/sanitization.test.js` (353 lines) already covers `safeString`, `requireFinite`, source-level audit. The two files without `safeString` (`capture.js`, `pine.js`) interpolate server-controlled strings (internal `colPath`, generated `token`), not user input.
- **KarmicP — `pine_set_source` hangs on large scripts.** Already shipped — `src/core/pine.js` setSource (lines 326-380) uses `pushEditOperations` + `setTimeout(...,0)` + 15s polling timeout, identical pattern to KarmicP's fix.
- **dsfortescue — `tab_switch` CDP redirect.** Our `switchTab` already calls `connectToTarget(target.id)` after `Target.activateTarget`. Their fix targeted a fork that didn't reconnect at all.
- **PasanteAdmin — `strategy_tester_open/close/get_results/get_trades`.** `ui_open_panel('strategy-tester')` covers open/close. Our `data_get_strategy_results` uses `_reportData.performance` (internal API) which is locale-stable and exposes more metrics than PasanteAdmin's DOM scrape. Same for `data_get_trades` (uses `_reportData.trades`). Their `set_settings` was deferred upstream by PasanteAdmin themselves (DOM-text matching was unreliable).

### Still on the backlog

- **KarmicP — validate cloud-persisted values** before round-tripping (alert payloads, watchlist names, layout names). Belt-and-braces against TV-side input that bypasses our local sanitization.
- **PasanteAdmin — strict `smart_compile` honest success.** We already check study-count delta; their check catches the false-positive when an unrelated study is added concurrently. Tighten ours by filtering by Pine title rather than count.
- **prezis — `deployMultipleScripts`** (sequential multi-script deploy with auto-switch between editor slots). Audited 2026-05-09: it's a 433-LOC workflow tool that depends on `pine_switch_script` (which we don't have) and orchestrates `setSource` + `save` + `add-to-chart` per script. Our existing primitives (`pine_set_source`, `pine_smart_compile`, `pine_save`, `chart_manage_indicator`) compose well enough for callers to chain themselves. Worth porting only if user-facing demand surfaces.
- **prezis — `pine_switch_script`** via the Pine editor dropdown (UI path, not REST). Useful when the script isn't already on chart. Prerequisite for `deployMultipleScripts`.
- **prezis — `fib-truth.js`** exact OHLCV wick lookup for Fib ground-truth verification.
- **KarmicP — replay CLI ergonomics.** `--chart`/`-c` to switch tab before replay; `--layout`/`-l` to load a saved layout first; compound `replay_start` accepting flexible date formats.
- **yaojinhui1993 — chart data download workflow.** `target_id` + filename params for bulk OHLCV export via TV's native download path; complements our 500-bar `data_get_ohlcv` cap.

## Held for design discussion

- **C.23 AsyncLocalStorage tab routing + persistent pin + study-readiness gate** (floatalgo `81efb1ff`) — significant architectural change to how tools are routed across tabs. Needs design call before code.

## Permanently skipped (kept so future-me doesn't re-investigate)

- **C.22 3-phase strategy detection with DOM fallback** (PR #51) — superseded by PR #90 (which we merged); also contains a duplicate of the `ui_evaluate` security hole we removed in N.35; also Korean-locale-specific DOM scraping that wouldn't work for most users.
- **C.26 DOM-scrape fallback for strategy results + trades** (PR #96) — English-only label parsing with line-position fragility. PR #90 covers TV 3.1.0 strategy detection robustly enough that the fallback complexity isn't worth the maintenance cost.
- **`data_get_strategy_results_dom` regex tightening** — was tied to C.22; skipped by transitivity.

## Speculative future direction

Sub-agent personas for strategy development:

- **Architect**: writes Pine Script strategy from spec.
- **Backtester**: runs parameter sweeps, reads strategy tester results.
- **Reviewer**: static analysis + `pine_check` before compile.
- **Reporter**: formats backtest results into structured summary.

Not action items — captured for later if/when we go this direction.
