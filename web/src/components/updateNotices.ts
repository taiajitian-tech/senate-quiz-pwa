export type NoticeIdentity = {
  id?: string;
  detectedAt?: string;
  target: string;
  name: string;
  type: string;
  summary: string;
};

type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;
const READ_KEY = 'updates_read_item_ids_v1';
const LEGACY_SEEN_KEY = 'updates_last_seen_generated_at_v1';

function browserStorage(): NoticeStorage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function getNoticeKey(item: NoticeIdentity): string {
  return item.id || JSON.stringify([item.target, item.name, item.type, item.summary]);
}

function noticeTime(item: NoticeIdentity): number {
  if (item.detectedAt) return Date.parse(item.detectedAt) || 0;
  const date = item.name.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/u);
  return date ? Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])) : 0;
}

export function newestNoticesFirst<T extends NoticeIdentity>(items: T[]): T[] {
  return [...items].sort((a, b) => noticeTime(b) - noticeTime(a));
}

export function readNoticeKeys(items: NoticeIdentity[], generatedAt: string, storage = browserStorage()): Set<string> {
  try {
    if (!storage) return new Set();
    const raw = storage.getItem(READ_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []);
    }
    // 以前の「確認済み日時」も引き継ぎ、既読だった案内を新規に戻さない。
    const lastSeen = storage.getItem(LEGACY_SEEN_KEY) || '';
    const seenTime = Date.parse(lastSeen) || 0;
    const keys = new Set(items.filter(item => lastSeen && (
      lastSeen === generatedAt || (noticeTime(item) > 0 && noticeTime(item) <= seenTime) || !item.detectedAt
    )).map(getNoticeKey));
    storage.setItem(READ_KEY, JSON.stringify([...keys]));
    return keys;
  } catch { return new Set(); }
}

export function markNoticesRead(items: NoticeIdentity[], generatedAt: string, storage = browserStorage()): void {
  try {
    if (!storage) return;
    const keys = readNoticeKeys(items, generatedAt, storage);
    items.forEach(item => keys.add(getNoticeKey(item)));
    storage.setItem(READ_KEY, JSON.stringify([...keys]));
    if (generatedAt) storage.setItem(LEGACY_SEEN_KEY, generatedAt);
  } catch { /* 保存できない環境でも画面は開ける。 */ }
}
