import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';

const THIS_HOST = hostname();

// Pin a unique registry path BEFORE importing the module so the
// module-level constant captures our temp path. Each test then clears
// the file body to isolate state.
const TMP = mkdtempSync(join(tmpdir(), 'pin-reg-'));
process.env.TV_MCP_REGISTRY_PATH = join(TMP, 'registry.json');

const registry = await import('../../src/core/pin_registry.js');

describe('core/pin_registry.js — smoke', () => {
  beforeEach(() => {
    // Clear registry file + any stray lock between tests.
    try { rmSync(process.env.TV_MCP_REGISTRY_PATH); } catch {}
    try { rmSync(process.env.TV_MCP_REGISTRY_PATH + '.lock'); } catch {}
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('claim() records pid + host + claimedAt for this process', async () => {
    const r = await registry.claim('target_abc');
    assert.equal(r.entry.pid, process.pid);
    assert.equal(typeof r.entry.host, 'string');
    assert.ok(r.entry.claimedAt > 0);
    assert.equal(r.displaced, null);
  });

  it('claim() refuses double-claim from another live PID without force', async () => {
    // Seed registry with a known live PID (this test process itself, but
    // tagged as a "different" pid by spoofing — easiest: write a manual entry
    // for our own PID then claim from "another" by direct file manipulation).
    // Simpler: write a file with our PID, then mock by directly editing the
    // file claimed-by field after a normal claim. The constraint is "PID alive
    // AND ≠ process.pid", so we need a second live PID. Use Node's own parent
    // PID (process.ppid) if alive — it almost always is.
    const otherPid = process.ppid;
    writeFileSync(process.env.TV_MCP_REGISTRY_PATH, JSON.stringify({
      version: 1,
      pins: { target_xyz: { pid: otherPid, host: THIS_HOST, lane: 'a', claimedAt: Date.now() } },
    }));
    await assert.rejects(
      () => registry.claim('target_xyz'),
      (err) => err.code === 'PIN_CONFLICT' && err.owner.pid === otherPid,
    );
  });

  it('claim() with force=true displaces existing owner', async () => {
    const otherPid = process.ppid;
    writeFileSync(process.env.TV_MCP_REGISTRY_PATH, JSON.stringify({
      version: 1,
      pins: { target_xyz: { pid: otherPid, host: THIS_HOST, lane: null, claimedAt: 1 } },
    }));
    const r = await registry.claim('target_xyz', { force: true });
    assert.equal(r.entry.pid, process.pid);
    assert.equal(r.displaced.pid, otherPid);
  });

  it('claim() prunes dead-PID entries from registry on read', async () => {
    const deadPid = 999999;  // very unlikely to be live
    writeFileSync(process.env.TV_MCP_REGISTRY_PATH, JSON.stringify({
      version: 1,
      pins: { dead_target: { pid: deadPid, host: THIS_HOST, claimedAt: 1 } },
    }));
    const r = await registry.claim('new_target');
    assert.equal(r.entry.pid, process.pid);
    // dead_target should have been pruned during the claim's read-modify-write
    const persisted = JSON.parse(readFileSync(process.env.TV_MCP_REGISTRY_PATH, 'utf8'));
    assert.equal(persisted.pins.dead_target, undefined);
    assert.equal(persisted.pins.new_target.pid, process.pid);
  });

  it('release() drops our claim, leaves others alone', async () => {
    await registry.claim('a');
    await registry.claim('b');
    const r = await registry.release('a');
    assert.equal(r.released, true);
    const list = await registry.list();
    assert.equal(list.pin_count, 1);
    assert.equal(list.pins[0].target_id, 'b');
  });

  it('release() of a tab we do not own returns released:false', async () => {
    writeFileSync(process.env.TV_MCP_REGISTRY_PATH, JSON.stringify({
      version: 1,
      pins: { foreign: { pid: process.ppid, host: THIS_HOST, claimedAt: 1 } },
    }));
    const r = await registry.release('foreign');
    assert.equal(r.released, false);
    // verify the foreign entry survived
    const persisted = JSON.parse(readFileSync(process.env.TV_MCP_REGISTRY_PATH, 'utf8'));
    assert.ok(persisted.pins.foreign);
  });

  it('releaseAll() drops only our pins, not others', async () => {
    await registry.claim('mine_1');
    await registry.claim('mine_2');
    // append a foreign pin
    const reg = JSON.parse(readFileSync(process.env.TV_MCP_REGISTRY_PATH, 'utf8'));
    reg.pins.theirs = { pid: process.ppid, host: THIS_HOST, claimedAt: 1 };
    writeFileSync(process.env.TV_MCP_REGISTRY_PATH, JSON.stringify(reg));

    await registry.releaseAll();
    const after = JSON.parse(readFileSync(process.env.TV_MCP_REGISTRY_PATH, 'utf8'));
    assert.equal(after.pins.mine_1, undefined);
    assert.equal(after.pins.mine_2, undefined);
    assert.ok(after.pins.theirs);
  });

  it('list() prunes dead PIDs and marks our entries with mine:true', async () => {
    await registry.claim('mine');
    const reg = JSON.parse(readFileSync(process.env.TV_MCP_REGISTRY_PATH, 'utf8'));
    reg.pins.dead = { pid: 999999, host: THIS_HOST, claimedAt: 1 };
    reg.pins.theirs = { pid: process.ppid, host: THIS_HOST, claimedAt: 1 };
    writeFileSync(process.env.TV_MCP_REGISTRY_PATH, JSON.stringify(reg));

    const out = await registry.list();
    assert.equal(out.pin_count, 2);
    const mine = out.pins.find(p => p.target_id === 'mine');
    const theirs = out.pins.find(p => p.target_id === 'theirs');
    const dead = out.pins.find(p => p.target_id === 'dead');
    assert.equal(mine.mine, true);
    assert.equal(theirs.mine, false);
    assert.equal(dead, undefined, 'dead PID pruned');
  });

  it('claim() with empty targetId throws', async () => {
    await assert.rejects(() => registry.claim(''), /requires a targetId/);
  });
});
