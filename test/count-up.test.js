import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countUpValue } from '../src/ui/countUp.js';

test('count-up eases from zero to positive, fractional and negative targets', () => {
  assert.equal(countUpValue(120, 0), 0);
  assert.equal(countUpValue(120, 1), 120);
  assert.equal(countUpValue(-50, 1), -50);
  assert.equal(countUpValue(0.5, 1), 0.5);
  assert.equal(countUpValue(100, -1), 0);
  assert.equal(countUpValue(100, 2), 100);
  assert.ok(countUpValue(100, 0.5) > 50);
});

test('shared numeric displays animate screen totals and respect reduced motion', async () => {
  const kit = await readFile(new URL('../src/ui/kit.js', import.meta.url), 'utf8');
  assert.match(kit, /isReduceMotionEnabled/);
  assert.match(kit, /const appReady = useContext\(AppReady\)/);
  assert.match(kit, /countUpValue\(Number\(value\), k\)/);
  assert.match(kit, /export function StatsStrip/);
  assert.match(kit, /CountRefreshContext/);
  for (const screen of ['Home', 'Dashboard', 'FuelScreen', 'CoopScreen', 'ListScreen', 'Overdue', 'Performance', 'Reports', 'Audit', 'Analysis']) {
    const source = await readFile(new URL(`../src/ui/screens/${screen}.js`, import.meta.url), 'utf8');
    assert.match(source, /CountText|CountValue|StatsStrip/, `${screen} should use the shared count-up display`);
  }
});

test('pull-to-refresh and visible sync progress are wired on dashboards, tables and summaries', async () => {
  const shell = await readFile(new URL('../src/ui/Shell.js', import.meta.url), 'utf8');
  const session = await readFile(new URL('../src/ui/session.js', import.meta.url), 'utf8');
  const kit = await readFile(new URL('../src/ui/kit.js', import.meta.url), 'utf8');
  assert.match(shell, /accessibilityRole="progressbar"/);
  assert.match(session, /progress: p/);
  assert.match(session, /pullRefresh/);
  assert.match(kit, /function WebRefreshControl/);
  assert.match(kit, /start\.scroll\.scrollTop <= 0 && y - start\.y >= 64/);
  assert.match(kit, /Platform\.OS === 'web'\s*\?\s*<WebRefreshControl/);
  for (const screen of ['Home', 'Dashboard', 'FuelScreen', 'CoopScreen', 'ListScreen', 'Overdue', 'Calendar', 'Performance', 'Reports', 'Audit', 'Analysis']) {
    const source = await readFile(new URL(`../src/ui/screens/${screen}.js`, import.meta.url), 'utf8');
    assert.match(source, /usePullRefresh/, `${screen} should expose pull-to-refresh`);
    assert.match(source, /refreshControl=/, `${screen} should attach pull-to-refresh to its scroll surface`);
  }
});
