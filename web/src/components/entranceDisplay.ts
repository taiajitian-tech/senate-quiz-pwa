type EntranceItem = {
  role?: string;
  name: string;
  kana?: string;
  lastName?: string;
};

const hasText = (value?: string): value is string => typeof value === "string" && value.length > 0;

const getSafeLastName = (item: EntranceItem): string => {
  if (hasText(item.lastName)) return item.lastName;
  return item.name;
};

export const getEntranceTop = (item: EntranceItem): string => {
  if (item.role === "懲罰委員長") return item.name;

  if (
    hasText(item.role) &&
    item.role.includes("委員長") &&
    !item.role.includes("特別") &&
    !item.role.includes("調査会") &&
    !item.role.includes("審査会")
  ) {
    return item.role;
  }

  if (hasText(item.role) && item.role.includes("特別委員長")) {
    return getSafeLastName(item) + "特別委員長";
  }

  if (hasText(item.role) && item.role.includes("調査会長")) {
    return getSafeLastName(item) + "調査会長";
  }

  if (hasText(item.role) && item.role.includes("審査会会長")) {
    return getSafeLastName(item) + "審査会会長";
  }

  if (hasText(item.role) && item.role.includes("副大臣")) {
    return getSafeLastName(item) + "副大臣";
  }

  return item.name;
};

export const getEntranceBottom = (item: EntranceItem): string => {
  if (item.role === "懲罰委員長") return "懲罰委員長";
  if (!hasText(item.kana)) return hasText(item.role) ? item.name + " " + item.role : item.name;
  if (!hasText(item.role)) return item.name + "（" + item.kana + "）";
  return item.name + "（" + item.kana + "） " + item.role;
};
