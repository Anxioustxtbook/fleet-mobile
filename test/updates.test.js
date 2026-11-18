import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Expo OTA updates use this EAS project, app-version runtimes, and matching build channels', () => {
  const app = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
  const eas = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  assert.equal(app.updates.url, `https://u.expo.dev/${app.extra.eas.projectId}`);
  assert.equal(app.runtimeVersion.policy, 'appVersion');
  assert.equal(app.updates.checkAutomatically, 'ON_LOAD');
  assert.ok(app.plugins.includes('expo-updates'));
  assert.equal(eas.build.preview.channel, 'preview');
  assert.equal(eas.build.production.channel, 'production');
});

test('Settings can check, download, and restart to apply an OTA update', () => {
  const source = fs.readFileSync(new URL('../src/ui/Pages.js', import.meta.url), 'utf8');
  assert.match(source, /Updates\.checkForUpdateAsync\(\)/);
  assert.match(source, /Updates\.fetchUpdateAsync\(\)/);
  assert.match(source, /Updates\.reloadAsync\(\)/);
  assert.match(source, /Check for updates/);
});
