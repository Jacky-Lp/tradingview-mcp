/**
 * pine_publish — Pine Script publish flow.
 *
 * Currently exposes **only** the read-only `publishDialogInspect` probe.
 * The active publishScript implementation from the jacktradesnq fork
 * (commit 5ec59b1, May 2026) is French-locale-only ("Touches finales",
 * "Continuer", "Publier", "Mettre à jour") and uses TV-build-specific
 * hashed CSS classes (`.title-input-olfWh9s2`, `.textarea-x5KHDULU`,
 * `.first-step-button-olfWh9s2`, `.segmentedControlBase-NZgAw_ip`).
 * Both inputs to that flow change every TV release; submitting a real
 * publish from a stale selector also risks an accidental public push to
 * TradingView's community library.
 *
 * The right shape for active publish is: run `pine_publish_dialog_inspect`
 * on the user's current TV build + locale, capture the actual labels +
 * class names, then generate a per-build selector map. That work lives
 * downstream — `pine_publish_dialog_inspect` enables it.
 */
import { evaluate as _evaluate } from '../connection.js';
import { ensurePineEditorOpen as _ensurePineEditorOpen } from './pine.js';

function _resolve(deps) {
  return {
    evaluate: deps?.evaluate || _evaluate,
    ensurePineEditorOpen: deps?.ensurePineEditorOpen || _ensurePineEditorOpen,
  };
}

/**
 * Click the Pine Editor's "Publish script" toolbar button and dump the
 * resulting dialog's full structure: inputs, buttons, radios/checkboxes,
 * headings, embedded editor containers. Used to discover per-TV-build
 * selectors before wiring a real publish flow.
 *
 * Returns { success, button_clicked: {clicked, text, aria, data_name},
 *           dialog_found, dialog_class, dialog_role, inputs[], buttons[],
 *           radios_or_checkboxes[], headings[], editor_containers[] }.
 */
export async function publishDialogInspect({ _deps } = {}) {
  const { evaluate, ensurePineEditorOpen } = _resolve(_deps);
  const editorReady = await ensurePineEditorOpen({ _deps });
  if (!editorReady) throw new Error('Could not open Pine Editor.');

  // Step 1 — click the publish button (heuristic: data-name, aria-label,
  // class substring "publishButton", or any visible button whose text or
  // aria-label matches /publish.*script/ or /publier.*script/).
  const buttonClicked = await evaluate(`
    (function() {
      function visible(el) { return el && el.offsetParent !== null; }
      var candidates = [];
      var byData = document.querySelectorAll('[data-name*="publish" i], [data-name*="Publish" i]');
      for (var i = 0; i < byData.length; i++) candidates.push(byData[i]);
      var byAria = document.querySelectorAll('[aria-label*="ublish" i]');
      for (var j = 0; j < byAria.length; j++) candidates.push(byAria[j]);
      var byClass = document.querySelectorAll('[class*="publishButton" i]');
      for (var n = 0; n < byClass.length; n++) candidates.push(byClass[n]);
      var btns = document.querySelectorAll('button, [role="button"]');
      for (var k = 0; k < btns.length; k++) {
        var t = (btns[k].textContent || '').trim();
        var al = btns[k].getAttribute('aria-label') || '';
        if (/publish.*script/i.test(t) || /publier.*script/i.test(t) ||
            /publish.*script/i.test(al) || /^publish$/i.test(t)) {
          candidates.push(btns[k]);
        }
      }
      for (var m = 0; m < candidates.length; m++) {
        if (visible(candidates[m])) {
          candidates[m].click();
          return {
            clicked: true,
            text: (candidates[m].textContent || '').trim().slice(0, 80),
            aria: candidates[m].getAttribute('aria-label') || null,
            data_name: candidates[m].getAttribute('data-name') || null,
          };
        }
      }
      return { clicked: false };
    })()
  `);

  if (!buttonClicked || !buttonClicked.clicked) {
    return { success: false, error: 'Publish Script button not found in Pine Editor toolbar.' };
  }

  await new Promise(r => setTimeout(r, 1500));

  // Step 2 — dump everything in the visible dialog so callers can
  // discover their TV build's actual selectors + labels.
  const inspection = await evaluate(`
    (function() {
      function visible(el) { return el && el.offsetParent !== null; }
      function preview(s) { s = String(s == null ? '' : s); return s.length > 100 ? s.slice(0, 100) : s; }
      function findLabel(el) {
        if (!el) return '';
        if (el.id) {
          var lab = document.querySelector('label[for="' + el.id + '"]');
          if (lab) return (lab.textContent || '').trim();
        }
        var p = el.parentElement;
        for (var i = 0; i < 4 && p; i++) {
          if (p.tagName === 'LABEL') return (p.textContent || '').trim();
          p = p.parentElement;
        }
        return (el.getAttribute('aria-label') || '').trim();
      }

      var dialogs = document.querySelectorAll('[role="dialog"], [class*="dialog" i], [class*="modal" i], [data-name*="dialog" i]');
      var dialog = null;
      for (var i = 0; i < dialogs.length; i++) {
        if (visible(dialogs[i])) { dialog = dialogs[i]; break; }
      }
      if (!dialog) return { dialog_found: false };

      var inputs = [];
      var raw = dialog.querySelectorAll('input, textarea, select');
      for (var a = 0; a < raw.length; a++) {
        var el = raw[a];
        var type = (el.type || el.tagName).toLowerCase();
        if (type === 'radio' || type === 'checkbox') continue;
        inputs.push({
          tag: el.tagName.toLowerCase(), type: type,
          name: el.name || null, id: el.id || null,
          placeholder: el.placeholder || null,
          aria_label: el.getAttribute('aria-label') || null,
          class: el.className || null,
          value_preview: preview(el.value),
        });
      }

      var buttons = [];
      var btns = dialog.querySelectorAll('button, [role="button"]');
      for (var b = 0; b < btns.length; b++) {
        if (!visible(btns[b])) continue;
        buttons.push({
          text: (btns[b].textContent || '').trim().slice(0, 120),
          aria_label: btns[b].getAttribute('aria-label') || null,
          class: btns[b].className || null,
          disabled: btns[b].disabled === true || btns[b].getAttribute('aria-disabled') === 'true',
        });
      }

      var radios = [];
      var rcs = dialog.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      for (var r = 0; r < rcs.length; r++) {
        radios.push({
          type: rcs[r].type, name: rcs[r].name || null, value: rcs[r].value || null,
          label_text: findLabel(rcs[r]),
          checked: rcs[r].checked === true,
        });
      }

      var headings = [];
      var hs = dialog.querySelectorAll('h1, h2, h3, h4, [role="heading"]');
      for (var h = 0; h < hs.length; h++) {
        var ht = (hs[h].textContent || '').trim();
        if (ht) headings.push(ht);
      }

      var editors = [];
      var eds = dialog.querySelectorAll('[class*="editor" i], [class*="monaco" i]');
      for (var e = 0; e < eds.length; e++) {
        editors.push({
          class: eds[e].className || null,
          tag: eds[e].tagName.toLowerCase(),
          has_monaco: /monaco/i.test(eds[e].className || ''),
        });
      }

      return {
        dialog_found: true,
        dialog_class: dialog.className || null,
        dialog_role: dialog.getAttribute('role') || null,
        inputs: inputs, buttons: buttons,
        radios_or_checkboxes: radios,
        headings: headings, editor_containers: editors,
      };
    })()
  `);

  if (!inspection || !inspection.dialog_found) {
    return { success: false, error: 'Publish button clicked but no dialog appeared after 1500ms.', button_clicked: buttonClicked };
  }

  return { success: true, button_clicked: buttonClicked, ...inspection };
}
