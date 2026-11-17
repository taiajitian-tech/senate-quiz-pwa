import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/components/memberSearchIndex.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { buildSearchIndex, searchPeople } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const dataSource = fs.readFileSync(new URL('../src/components/data.ts', import.meta.url), 'utf8');
const dataOutput = ts.transpileModule(dataSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { parsePersonsJson } = await import(`data:text/javascript;base64,${Buffer.from(dataOutput).toString('base64')}`);
const person = (name, kana, extra = {}) => ({ id: 1, name, kana, images: [], ...extra });

test('both chambers are searchable and overlapping minister records appear only once', () => {
  const index = buildSearchIndex({
    senators: [person('参院 太郎', 'さんいんたろう', { district: '北海道', party: 'テスト党' })],
    representatives: [person('衆院 花子', 'しゅういんはなこ', { district: '東京1' })],
    ministers: [person('衆院花子', 'しゅういんはなこ', { group: '防災大臣 / 衆議院' })],
  });
  assert.equal(index.length, 2);
  assert.equal(searchPeople(index, '衆院')[0].chamber, '衆議院');
  assert.equal(searchPeople(index, '防災')[0].person.name, '衆院 花子');
  assert.deepEqual(searchPeople(index, '北海道 テスト党').map(item => item.person.name), ['参院 太郎']);
});

test('partial kana, katakana, spaced full names, and width variations match consistently', () => {
  const index = buildSearchIndex({ representatives: [person('山田 太郎', 'やまだたろう', { district: '東京12' })] });
  for (const query of ['やま', 'ヤマ', 'ﾔﾏ', '山田 太郎', '東京１２']) assert.equal(searchPeople(index, query).length, 1, query);
  assert.deepEqual(searchPeople(index, '  '), []);
});

test('name matches rank before entries matching only a role', () => {
  const index = buildSearchIndex({ representatives: [person('山田 太郎', 'やまだたろう'), person('青木 花子', 'あおきはなこ')], ministers: [person('青木花子', 'あおきはなこ', { group: '山田委員会担当' })] });
  assert.equal(searchPeople(index, '山田')[0].person.name, '山田 太郎');
});

test('the current full House and Senate rosters are indexed, including role holders', () => {
  const filenames = { senators: 'senators', representatives: 'representatives', ministers: 'ministers', viceMinisters: 'vice-ministers', parliamentarySecretaries: 'parliamentary-secretaries', councilorsOfficersList: 'councilors-officers', houseOfficersList: 'house-officers' };
  const rosters = Object.fromEntries(Object.entries(filenames).map(([target, file]) => [target, parsePersonsJson(JSON.parse(fs.readFileSync(new URL(`../public/data/${file}.json`, import.meta.url), 'utf8')), target, 'basic')]));
  const index = buildSearchIndex(rosters);
  for (const target of ['representatives', 'senators']) for (const member of rosters[target]) {
    assert.ok(searchPeople(index, member.name).some(item => item.person.name.replace(/\s/gu, '') === member.name.replace(/\s/gu, '')), member.name);
  }
  assert.equal(searchPeople(index, '高市').filter(item => item.person.name.includes('高市')).length, 1);
  assert.ok(searchPeople(index, '防災').some(item => item.person.name.includes('細野')));
});
