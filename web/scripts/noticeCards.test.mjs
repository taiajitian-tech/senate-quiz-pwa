import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const uri = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const helpers = uri(compile(fs.readFileSync(new URL('../src/components/updateNotices.ts', import.meta.url), 'utf8')));
let source = fs.readFileSync(new URL('../src/components/UpdatesView.tsx', import.meta.url), 'utf8')
  .replace("import './UpdatesView.css';", '')
  .replace("from './updateNotices'", `from '${helpers}'`)
  .replace('function NoticeCard(', 'export function NoticeCard(');
source = compile(source).replaceAll('from "react/jsx-runtime"', `from '${pathToFileURL(require.resolve('react/jsx-runtime'))}'`)
  .replace('from \'react\'', `from '${pathToFileURL(require.resolve('react'))}'`);
const { NoticeCard } = await import(uri(source));
const payload = JSON.parse(fs.readFileSync(new URL('../public/data/updates.json', import.meta.url), 'utf8'));

test('verified role card renders a headline, effective date, separate comparison rows, and collapsed details', () => {
  const item = payload.items.find(item => item.name === '細野 豪志');
  const html = renderToStaticMarkup(createElement(NoticeCard, { item, onOpenPerson() {} }));
  assert.match(html, /細野豪志氏が防災大臣に就任/u);
  assert.match(html, /2026\/11\/02/u);
  assert.match(html, /<dt>変更前<\/dt>/u);
  assert.match(html, /<dt>変更後<\/dt>/u);
  assert.match(html, /<summary>詳細を見る<\/summary>/u);
  assert.doesNotMatch(html, /<details[^>]*\sopen/u);
  assert.ok(html.includes(item.sourceUrl));
  assert.match(html, /復興大臣/u);
});

test('all stored notices render without inferring dates or losing supplementary text', () => {
  for (const item of payload.items) {
    const html = renderToStaticMarkup(createElement(NoticeCard, { item, onOpenPerson() {} }));
    assert.ok(html.includes('<h3>'));
    assert.match(html, /詳細を見る/u);
    if (!item.effectiveAt && item.target !== 'notice') assert.match(html, /変更日：未確認/u);
    assert.ok(!html.includes('undefined'));
  }
});
