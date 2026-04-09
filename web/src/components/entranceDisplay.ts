
// 玄関モード用 表示ロジック（最終仕様）

export const getEntranceTop = (item:any) => {
  if (item.role === "懲罰委員長") return item.name;

  if (item.role?.includes("委員長") && !item.role.includes("特別") && !item.role.includes("調査会") && !item.role.includes("審査会")) {
    return item.role; // 担当委員会名そのまま
  }

  if (item.role?.includes("特別委員長")) return item.lastName + "特別委員長";
  if (item.role?.includes("調査会会長")) return item.lastName + "調査会会長";
  if (item.role?.includes("審査会会長")) return item.lastName + "審査会会長";
  if (item.role?.includes("副大臣")) return item.lastName + "副大臣";

  return item.name;
};

export const getEntranceBottom = (item:any) => {
  if (item.role === "懲罰委員長") return "懲罰委員長";
  return `${item.name}（${item.kana}） ${item.role}`;
};
