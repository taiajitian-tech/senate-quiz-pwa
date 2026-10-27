import { formatEntranceViceMinisterName, formatLearningHeading, getLearningAnswerLines, parsePersonsJson, shouldShowLearningHeadingKana, type Person, type Target } from './data';

export const PRINT_OPTIONS = [
  { target: 'senators', label: '参議院一般議員' },
  { target: 'councilorsOfficersList', label: '参議院役員' },
  { target: 'viceMinisters', label: '副大臣' },
  { target: 'parliamentarySecretaries', label: '政務官（衆参両院）' },
] as const;
export type PrintTarget = typeof PRINT_OPTIONS[number]['target'];
export type CardRoster = Partial<Record<Target, Person[]>>;
export type PrintCard = { key: string; name: string; heading: string; lines: string[]; image: string };
export type CardGroup = { key: string; label: string; cards: PrintCard[] };
export type CardPage = { key: string; label: string; total: number; sectionPage: number; sectionPages: number; cards: PrintCard[] };
const compact = (s: string) => s.replace(/[\s\u3000]+/gu, '');
const collator = new Intl.Collator('ja');

function makeCard(person: Person, target: Target, people: Person[]): PrintCard {
  const heading = target === 'viceMinisters' ? formatEntranceViceMinisterName(person) : formatLearningHeading(person, target, 'entrance', people);
  const kana = shouldShowLearningHeadingKana(person, target, 'entrance', people) ? person.kana : '';
  const details = getLearningAnswerLines(person, target, 'entrance');
  return {
    key: `${target}:${person.id}`,
    name: person.name,
    heading,
    lines: [...(kana ? [kana] : []), ...details],
    image: person.images?.[0] || '',
  };
}

export function buildCardGroups(rosters: CardRoster, selected: PrintTarget[], includeAllCouncilors: boolean): CardGroup[] {
  const covered = new Set<string>();
  const groups: CardGroup[] = [];
  for (const option of PRINT_OPTIONS) {
    if (!selected.includes(option.target)) continue;
    const people = parsePersonsJson(rosters[option.target] || [], option.target, option.target === 'parliamentarySecretaries' ? 'basic' : 'entrance', rosters)
      .sort((a, b) => collator.compare(a.kana || a.name, b.kana || b.name));
    const cards = people.map(person => { covered.add(compact(person.name)); return makeCard(person, option.target, people); });
    if (cards.length) groups.push({ key: option.target, label: option.label, cards });
  }
  if (includeAllCouncilors && selected.includes('senators')) {
    const senators = rosters.senators || [];
    const sources: Target[] = ['councilorsOfficersList', 'ministers', 'viceMinisters', 'parliamentarySecretaries'];
    const extra: { person: Person; target: Target }[] = [];
    for (const senator of senators) {
      if (covered.has(compact(senator.name))) continue;
      const target = sources.find(key => rosters[key]?.some(person => compact(person.name) === compact(senator.name)));
      const person = target && rosters[target]?.find(item => compact(item.name) === compact(senator.name));
      extra.push({ person: person ? { ...person, images: senator.images } : senator, target: target || 'senators' });
      covered.add(compact(senator.name));
    }
    extra.sort((a, b) => collator.compare(a.person.kana || a.person.name, b.person.kana || b.person.name));
    if (extra.length) groups.push({ key: 'councilors-extra', label: '参議院の大臣等（補完）', cards: extra.map(({ person, target }) => makeCard(person, target, rosters[target] || [])) });
  }
  return groups;
}

export function paginateCards(groups: CardGroup[]): CardPage[] {
  return groups.flatMap(group => Array.from({ length: Math.ceil(group.cards.length / 20) }, (_, index) => ({
    key: `${group.key}:${index}`, label: group.label, total: group.cards.length,
    sectionPage: index + 1, sectionPages: Math.ceil(group.cards.length / 20), cards: group.cards.slice(index * 20, index * 20 + 20),
  })));
}

export function getCardBodyLines(card: PrintCard): string[] {
  return card.lines.flatMap(line => {
    const match = line.match(/^(.*?)（([^）]+)）$/u);
    return match && [...line].length > 17 ? [match[1], `（${match[2]}）`] : [line];
  });
}
