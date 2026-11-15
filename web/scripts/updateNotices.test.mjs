import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/components/updateNotices.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { getNoticeKey, newestNoticesFirst, readNoticeKeys, markNoticesRead, noticePresentation } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const item = (id, date) => ({ id, detectedAt: date, target: 'ministers', name: 'テスト太郎', type: 'changed', summary: id });
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('newest changes precede old manual announcements regardless of payload order', () => {
  const old = item('old', '2026-11-01T00:00:00Z');
  const latest = item('latest', '2026-11-15T00:00:00Z');
  const manual = { target: 'notice', name: '2026年10月27日：印刷機能', type: 'changed', summary: '案内' };
  const input = [manual, old, latest];
  assert.deepEqual(newestNoticesFirst(input), [latest, old, manual]);
  assert.deepEqual(input, [manual, old, latest]);
});

test('read notices stay read after reordering, regenerating, and adding another change', () => {
  const storage = memory();
  const first = item('one', '2026-11-01T00:00:00Z');
  const second = item('two', '2026-11-02T00:00:00Z');
  markNoticesRead([first], '2026-11-01T00:00:00Z', storage);
  const read = readNoticeKeys([second, first], '2026-11-15T00:00:00Z', storage);
  assert.ok(read.has(getNoticeKey(first)));
  assert.ok(!read.has(getNoticeKey(second)));
  assert.equal([second, first].filter(item => !read.has(getNoticeKey(item))).length, 1);
  markNoticesRead([second, first], '2026-11-15T00:00:00Z', storage);
  assert.equal(readNoticeKeys([first, second], '2026-11-16T00:00:00Z', storage).size, 2);
});

test('old confirmation dates migrate without hiding a newer event', () => {
  const storage = memory();
  storage.setItem('updates_last_seen_generated_at_v1', '2026-11-02T00:00:00Z');
  const old = item('old', '2026-11-01T00:00:00Z');
  const next = item('next', '2026-11-03T00:00:00Z');
  const read = readNoticeKeys([next, old], '2026-11-03T00:00:00Z', storage);
  assert.ok(read.has(getNoticeKey(old)));
  assert.ok(!read.has(getNoticeKey(next)));
});

test('undated announcements keep the same read key when only the file timestamp changes', () => {
  const storage = memory();
  const manual = { target: 'notice', name: 'お知らせ', type: 'changed', summary: '同じ内容' };
  markNoticesRead([manual], '2026-11-01T00:00:00Z', storage);
  assert.ok(readNoticeKeys([manual], '2026-11-15T00:00:00Z', storage).has(getNoticeKey(manual)));
  assert.ok(!readNoticeKeys([manual], '2026-11-15T00:00:00Z', storage).has(getNoticeKey({ ...manual, summary: '新しい内容' })));
});

test('comparison shows changed duties while full concurrent roles remain in details', () => {
  const notice = { ...item('one', '2026-11-15T00:00:00Z'), changes: [{ field: 'role', label: '役職', before: '兼務 / 旧役職', after: '兼務 / 新役職' }] };
  const view = noticePresentation(notice);
  assert.match(view.headline, /新役職/u);
  assert.equal(view.comparison.before, '旧役職');
  assert.equal(view.comparison.after, '新役職');
  assert.equal(notice.changes[0].after, '兼務 / 新役職');
  assert.equal(view.effectiveAt, '');
  assert.doesNotMatch(view.headline, /就任|退任/u);
});

test('verified headlines and effective dates do not change the stable read identity', () => {
  const notice = item('known', '2026-11-15T00:00:00Z');
  const enriched = { ...notice, headline: 'テスト太郎氏が新役職に就任', effectiveAt: '2026-11-02' };
  assert.equal(getNoticeKey(enriched), getNoticeKey(notice));
  assert.equal(noticePresentation(enriched).effectiveAt, '2026-11-02');
  assert.equal(noticePresentation(enriched).headline, enriched.headline);
});
