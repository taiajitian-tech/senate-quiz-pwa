import type { Person, Target } from './data';

export const SEARCH_TARGETS: Target[] = ['senators', 'representatives', 'ministers', 'viceMinisters', 'parliamentarySecretaries', 'councilorsOfficersList', 'houseOfficersList'];
export type SearchEntry = { key: string; person: Person; chamber: string; roles: string[]; party: string; text: string };

function fold(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/\s+/gu, '');
}

export function buildSearchIndex(rosters: Partial<Record<Target, Person[]>>): SearchEntry[] {
  const entries = new Map<string, SearchEntry>();
  for (const target of SEARCH_TARGETS) for (const person of rosters[target] || []) {
    const key = fold(person.name);
    const member = target === 'senators' || target === 'representatives';
    let entry = entries.get(key);
    if (!entry) {
      entry = { key, person: { ...person }, chamber: '', roles: [], party: '', text: '' };
      entries.set(key, entry);
    }
    if (member) entry.chamber = target === 'senators' ? '参議院' : '衆議院';
    if (!entry.party) entry.party = person.party || (member ? person.group || '' : '');
    if (!entry.person.kana) entry.person.kana = person.kana;
    if (!entry.person.district) entry.person.district = person.district;
    if (!entry.person.images.length) entry.person.images = person.images;
    if (entry.person.terms === undefined) entry.person.terms = person.terms;
    if (!member) {
      const role = (person.subRole || person.role || person.group || '').replace(/\s*\/\s*(参議院|衆議院)$/u, '').trim();
      if (role && !entry.roles.includes(role)) entry.roles.push(role);
    }
    entry.text += fold([person.name, person.kana, person.party, person.group, person.role, person.subRole, person.district, person.terms, person.nextElectionYear, entry.chamber].filter(Boolean).join(' '));
  }
  return [...entries.values()];
}

export function searchPeople(entries: SearchEntry[], query: string): SearchEntry[] {
  const tokens = query.normalize('NFKC').trim().split(/\s+/u).map(fold).filter(Boolean);
  if (!tokens.length) return [];
  const compact = tokens.join('');
  const rank = (entry: SearchEntry) => {
    const name = fold(entry.person.name);
    const kana = fold(entry.person.kana || '');
    return name === compact ? 0 : name.startsWith(compact) ? 1 : kana.startsWith(compact) ? 2 : name.includes(compact) || kana.includes(compact) ? 3 : 4;
  };
  return entries.filter(entry => tokens.every(token => entry.text.includes(token))).sort((a, b) => rank(a) - rank(b) || (a.person.kana || a.person.name).localeCompare(b.person.kana || b.person.name, 'ja'));
}
