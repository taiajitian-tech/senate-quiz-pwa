// RoleListView.tsx 修正（該当部分のみ）

const speakers = data.filter(item =>
  item.role?.includes("議長") || item.role?.includes("副議長")
);

// 修正：参議院は「委員長」＋「調査会長」
const councilorsCommitteeChairs = data.filter(item =>
  item.chamber === "参議院" &&
  (item.role?.includes("委員長") || item.role?.includes("調査会長"))
);

// 衆議院は従来通り
const houseCommitteeChairs = data.filter(item =>
  item.chamber === "衆議院" &&
  item.role?.includes("委員長")
);
