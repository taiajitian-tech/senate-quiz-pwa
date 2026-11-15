import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compareRecords, mergeUpdateHistory } from './generateUpdates.mjs';

test('role changes remain changes when the generated ID changes', () => {
  const target = { key: 'ministers', label: '大臣' };
  const result = compareRecords(target,
    [{ id: 1, name: 'テスト 太郎', group: '旧役職' }],
    [{ id: 99, name: 'テスト 太郎', group: '新役職' }]);
  assert.deepEqual(result.counts, { added: 0, removed: 0, changed: 1 });
  assert.match(result.items[0].summary, /旧役職 → 新役職/u);
});

test('history survives new changes and stable IDs distinguish later events', () => {
  const item = { target: 'ministers', name: 'テスト 太郎', type: 'changed', summary: '役職A → 役職B' };
  const first = mergeUpdateHistory([], [item], '2026-11-01T00:00:00Z');
  const second = mergeUpdateHistory(first, [item], '2026-11-02T00:00:00Z');
  assert.equal(second.length, 2);
  assert.notEqual(second[0].id, second[1].id);
  assert.equal(second[1].id, first[0].id);
  assert.deepEqual(mergeUpdateHistory(second, [], '2026-11-03T00:00:00Z'), second);
  assert.deepEqual(mergeUpdateHistory(second, [second[0]], '2026-11-03T00:00:00Z'), second);
});

test('direct roster edits publish every change and no-change checks do not repeat notifications', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'senate-notices-'));
  try {
    const web = path.join(root, 'web');
    const data = path.join(web, 'public/data');
    fs.mkdirSync(data, { recursive: true });
    fs.mkdirSync(path.join(web, 'scripts'));
    fs.copyFileSync(new URL('./generateUpdates.mjs', import.meta.url), path.join(web, 'scripts/generateUpdates.mjs'));
    const write = (name, value) => fs.writeFileSync(path.join(data, name), JSON.stringify(value));
    for (const name of ['senators', 'representatives', 'vice-ministers', 'parliamentary-secretaries', 'councilors-officers', 'house-officers', 'manual-notices']) write(`${name}.json`, []);
    const before = Array.from({ length: 85 }, (_, i) => ({ id: i + 1, name: `テスト${i}`, group: '旧役職' }));
    write('ministers.json', before);
    write('updates.json', { generatedAt: '2026-10-01T00:00:00Z', items: [], totalChanges: 0 });
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init'); git('config', 'user.name', 'Notice test'); git('config', 'user.email', 'test@example.invalid');
    git('add', '.'); git('commit', '-m', 'Initial published data');
    write('ministers.json', before.map(item => ({ ...item, id: item.id + 100, group: '新役職' })));
    git('add', '.'); git('commit', '-m', 'Direct roster change without notices');
    const run = () => {
      execFileSync(process.execPath, ['scripts/generateUpdates.mjs'], { cwd: web, stdio: 'pipe' });
      return JSON.parse(fs.readFileSync(path.join(data, 'updates.json'), 'utf8'));
    };
    const first = run();
    assert.equal(first.totalChanges, 85);
    assert.equal(first.items.length, 85);
    assert.ok(first.items.every(item => item.type === 'changed' && item.id && item.detectedAt));
    git('add', '.'); git('commit', '-m', 'Publish notices');
    const second = run();
    assert.equal(second.generatedAt, first.generatedAt);
    assert.deepEqual(second.items, first.items);
    write('manual-notices.json', [{ target: 'notice', name: '新しい案内', type: 'changed', summary: '案内本文' }]);
    const third = run();
    assert.equal(third.items.length, 86);
    assert.equal(third.items[0].name, '新しい案内');
    assert.deepEqual(third.items.slice(1), first.items);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
