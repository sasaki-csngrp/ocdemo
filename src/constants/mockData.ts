/** コードマスタ共通形式 */
export type CodeMasterItem = {
  code: string;
  name: string;
};

/** 取引先マスタ（自動車バッテリー業界想定） */
export const PARTIES: readonly CodeMasterItem[] = [
  { code: "1001", name: "〇〇商事" },
  { code: "2001", name: "△△電池工業" },
  { code: "3001", name: "関東物流センター" },
  { code: "1002", name: "自動車部品ホールディングス" },
  { code: "2002", name: "極板製造所横浜" },
  { code: "3002", name: "西日本バッテリー販売" },
  { code: "1003", name: "グリーンモビリティ部品" },
  { code: "2003", name: "解体リサイクル化工" },
  { code: "3003", name: "中部セル流通基地" },
  { code: "1004", name: "東洋エネルギー商事" },
] as const;

/** 製品マスタ */
export const PRODUCTS: readonly CodeMasterItem[] = [
  { code: "B001", name: "リチウムセルL型" },
  { code: "B002", name: "鉛蓄電池パック" },
  { code: "B003", name: "電解液ユニット" },
  { code: "B004", name: "AGMバッテリー12V" },
  { code: "B005", name: "セパレータロール" },
  { code: "B006", name: "角形リチウムモジュール" },
  { code: "B007", name: "ジクロマット正極板" },
  { code: "B008", name: "コールドチェーン梱包材" },
  { code: "B009", name: "48Vマイルド用補機バッテリー" },
  { code: "B010", name: "リサイクル鉛インゴット" },
] as const;
