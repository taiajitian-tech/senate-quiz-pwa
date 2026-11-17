import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const uri = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const srsUrl = uri(compile(fs.readFileSync(new URL('../src/components/srs.ts', import.meta.url), 'utf8')));
const { sanitizeProgressItem, applyGrade } = await import(srsUrl);
const learnSource = fs.readFileSync(new URL('../src/components/Learn.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('Learn.tsx', learnSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// Test the actual selector used by Learn without loading the screen or browser storage.
const names = new Set(['normalizePersonName', 'sortByRisk', 'pickFromTopBand', 'pickNext']);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast));
const day = ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'DAY'));
assert.equal(functions.length, names.size);
const { pickNext } = await import(uri(compile(`import {getForgettingScore,isMastered} from '${srsUrl}';\n${day.getText(ast)}\n${functions.join('\n')}\nexport {pickNext};`)));
const now = Date.parse('2026-11-17T00:00:00Z');
const items = Array.from({ length: 23 }, (_, index) => ({ id: index + 1, name: `議員${index + 1}`, images: [] }));
const progressFor = status => Object.fromEntries(items.map(item => [item.id, sanitizeProgressItem(item.id, { status, reps: 10, stability: 60, due: now + 60 * 86400000, lastSeenAt: now }, now)]));
const deterministic = run => {
  const previous = Math.random;
  Math.random = () => .99; // Reproduces the former 95% chance of stopping on mastered-only rosters.
  try { run(); } finally { Math.random = previous; }
};

test('ordinary and reverse sessions exhaust every unasked person even when everyone is healthy or mastered', () => deterministic(() => {
  for (const mode of ['learn', 'reverse']) for (const status of ['review', 'mastered']) {
    const progress = progressFor(status);
    const before = structuredClone(progress);
    const asked = new Set();
    for (let count = 0; count < items.length; count++) {
      const next = pickNext(items, progress, now, mode, asked, new Set());
      assert.ok(next, `${mode}/${status}: stopped after ${count}`);
      assert.ok(!asked.has(next.id));
      asked.add(next.id);
    }
    assert.equal(pickNext(items, progress, now, mode, asked, new Set()), null);
    assert.ok(pickNext(items, progress, now, mode, new Set(), new Set()), 'next session must start');
    assert.deepEqual(progress, before, 'selection must not alter saved progress');
  }
}));

test('learning continues after the final difficult person is answered correctly', () => deterministic(() => {
  const progress = progressFor('mastered');
  progress[1] = sanitizeProgressItem(1, { status: 'leech', lapses: 3, stability: .4, due: now, lastSeenAt: now }, now);
  const first = pickNext(items, progress, now, 'learn', new Set(), new Set());
  assert.equal(first.id, 1);
  progress[1] = applyGrade(progress[1], 1, 'good', now);
  assert.ok(pickNext(items, progress, now, 'learn', new Set([1]), new Set()));
}));

test('review remains limited to due or difficult people', () => deterministic(() => {
  assert.equal(pickNext(items, progressFor('review'), now, 'review', new Set(), new Set()), null);
  assert.equal(pickNext(items, progressFor('mastered'), now, 'review', new Set(), new Set()), null);
  assert.equal(pickNext(items, {}, now, 'review', new Set(), new Set()), null);
  const progress = progressFor('review');
  progress[7].due = now - 1;
  assert.equal(pickNext(items, progress, now, 'review', new Set(), new Set()).id, 7);
}));

test('one-round forced order still wins and previously asked IDs are excluded', () => deterministic(() => {
  const progress = progressFor('mastered');
  assert.equal(pickNext(items, progress, now, 'learn', new Set(), new Set(), 9).id, 9);
  assert.notEqual(pickNext(items, progress, now, 'learn', new Set([9]), new Set(), 9).id, 9);
  assert.equal(pickNext([], progress, now, 'learn', new Set(), new Set()), null);
}));
