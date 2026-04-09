// Auto.tsx 修正差分（表示部分のみ置き換え）

const isCommitteeComplete = (item:any) => {
  return item.role && (
    item.role.includes("委員長") ||
    item.role.includes("会長")
  ) && !item.role.includes("調査会") && !item.role.includes("審査会");
};

const getTop = (item:any) => {
  if (item.role?.includes("副大臣")) return item.lastName + "副大臣";
  if (item.role?.includes("大臣政務官")) return item.lastName + "大臣政務官";

  if (item.role?.includes("委員長") || item.role?.includes("会長")) {
    if (item.role === "懲罰委員長") return item.name;
    return item.lastName + item.role;
  }

  return item.name;
};

const getBottom1 = (item:any) => {
  return `${item.name}（${item.kana}）`;
};

const getBottom2 = (item:any) => {
  if (!item.role) return "";

  // 完結してる委員長は3行目なし
  if (isCommitteeComplete(item)) return "";

  if (item.role === "懲罰委員長") return "懲罰委員長";

  return item.role;
};
