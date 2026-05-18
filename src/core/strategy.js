/**
 * Strategy Tester controls beyond what data.js / chart.js expose.
 *
 * Currently: setDeepBacktestRange — drive the Deep Backtesting calendar
 * picker in the Strategy Tester header. Used by historical-replay sweeps
 * that need to scope a backtest to a specific date window before the
 * tester re-runs.
 *
 * Ported from jacktradesnq fork (commit 7c5b6c2, May 2026). Adapted to
 * our _deps DI pattern + safeString interpolation. Locale tolerant
 * (English / French / generic "OK" / "Apply" submit labels).
 */
import { evaluate as _evaluate } from '../connection.js';

function _resolve(deps) {
  return { evaluate: deps?.evaluate || _evaluate };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function setDeepBacktestRange({ from, to, _deps } = {}) {
  if (!YMD.test(String(from || '')) || !YMD.test(String(to || ''))) {
    throw new Error('from and to must be YYYY-MM-DD strings.');
  }
  const { evaluate } = _resolve(_deps);

  // Step 1 — open the date-range picker in the Strategy Tester header.
  // Heuristic match: a visible button whose text contains a year + an
  // en/em/hyphen dash, scoped to a strategy-tester container if found.
  const opened = await evaluate(`
    (function() {
      function visible(el) { return el && el.offsetParent !== null; }
      var st = document.querySelector('[class*="strategy-tester" i], [data-name*="strategy-tester" i], [class*="strategyTester" i]');
      var scope = st || document;
      var btns = scope.querySelectorAll('button, [role="button"]');
      for (var i = 0; i < btns.length; i++) {
        if (!visible(btns[i])) continue;
        var t = (btns[i].textContent || '').trim();
        if (/\\d{4}/.test(t) && /[—\\-–]/.test(t) && t.length < 60) {
          btns[i].click();
          return { ok: true, text: t };
        }
      }
      return { ok: false, error: 'date range button not found in strategy tester' };
    })()
  `);
  if (!opened || !opened.ok) {
    return { success: false, error: opened?.error || 'could not open Deep BT range picker' };
  }

  // Step 2 — wait for the modal's two YYYY-MM-DD inputs to mount.
  let inputCount = 0;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    const probe = await evaluate(`
      (function() {
        var ins = document.querySelectorAll('input[placeholder="YYYY-MM-DD"]');
        var n = 0;
        for (var i = 0; i < ins.length; i++) { if (ins[i].offsetParent !== null) n++; }
        return n;
      })()
    `);
    inputCount = Number(probe) || 0;
    if (inputCount >= 2) break;
  }
  if (inputCount < 2) {
    return { success: false, error: 'date range modal did not open (no YYYY-MM-DD inputs found)' };
  }

  // Step 3 — fill both inputs via React-friendly setter, click submit.
  const escFrom = JSON.stringify(from);
  const escTo = JSON.stringify(to);
  const filled = await evaluate(`
    (function() {
      function visible(el) { return el && el.offsetParent !== null; }
      function setReactInputValue(el, value) {
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      var ins = document.querySelectorAll('input[placeholder="YYYY-MM-DD"]');
      var visIns = [];
      for (var i = 0; i < ins.length; i++) { if (visible(ins[i])) visIns.push(ins[i]); }
      if (visIns.length < 2) return { ok: false, error: 'fewer than 2 visible date inputs' };
      setReactInputValue(visIns[0], ${escFrom});
      setReactInputValue(visIns[1], ${escTo});

      var submitBtn = null;
      var allBtns = document.querySelectorAll('button');
      for (var b = 0; b < allBtns.length; b++) {
        if (!visible(allBtns[b])) continue;
        var t = (allBtns[b].textContent || '').trim();
        if (/^(S[ée]lectionner|Select|Apply|Appliquer|OK)$/i.test(t)) { submitBtn = allBtns[b]; break; }
      }
      if (!submitBtn) return { ok: false, error: 'submit button not found', set_from: visIns[0].value, set_to: visIns[1].value };
      if (submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true') {
        return { ok: false, error: 'submit button disabled (date range may be invalid)', set_from: visIns[0].value, set_to: visIns[1].value };
      }
      submitBtn.click();
      return { ok: true, set_from: visIns[0].value, set_to: visIns[1].value, button: (submitBtn.textContent || '').trim() };
    })()
  `);
  if (!filled || !filled.ok) {
    return { success: false, error: filled?.error || 'could not fill range', detail: filled };
  }

  // Step 4 — verify the strategy-tester button reflects the new range.
  await new Promise(r => setTimeout(r, 1000));
  const verify = await evaluate(`
    (function() {
      function visible(el) { return el && el.offsetParent !== null; }
      var st = document.querySelector('[class*="strategy-tester" i], [data-name*="strategy-tester" i], [class*="strategyTester" i]');
      var scope = st || document;
      var btns = scope.querySelectorAll('button, [role="button"]');
      for (var i = 0; i < btns.length; i++) {
        if (!visible(btns[i])) continue;
        var t = (btns[i].textContent || '').trim();
        if (/\\d{4}/.test(t) && /[—\\-–]/.test(t) && t.length < 60) {
          return { displayed: t };
        }
      }
      return { displayed: null };
    })()
  `);

  const yearFrom = from.slice(0, 4);
  const yearTo = to.slice(0, 4);
  const display = verify?.displayed || '';
  const matches = display.includes(yearFrom) && display.includes(yearTo);

  return {
    success: matches,
    requested: { from, to },
    set_inputs: { from: filled.set_from, to: filled.set_to },
    submit_button: filled.button,
    displayed: verify?.displayed || null,
    note: matches ? undefined : 'Range submitted but display verification did not match the requested years. Check Strategy Tester manually.',
  };
}
