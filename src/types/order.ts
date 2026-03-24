/**
 * 受注ヘッダ（契約先・納入先・場所・納期・内示番号）
 */
export type OrderHeader = {
  /** 契約先コード（取引先マスタ参照） */
  contractPartyCode: string;
  /** 納入先コード（取引先マスタ参照） */
  deliveryPartyCode: string;
  /** 納入場所・倉庫・ライン等 */
  deliveryLocation: string;
  /** 納期（ISO 8601 日付文字列推奨） */
  dueDate: string;
  /** 内示番号（顧客からの生産内示・予測連携番号など） */
  forecastNumber: string;
};

/**
 * 受注明細（製品・数量・単価・金額）
 */
export type OrderLine = {
  /** 製品コード（製品マスタ参照） */
  productCode: string;
  /** 製品名称 */
  productName: string;
  /** 数量 */
  quantity: number;
  /** 単価 */
  unitPrice: number;
  /** 金額（通常 quantity × unitPrice） */
  amount: number;
};
