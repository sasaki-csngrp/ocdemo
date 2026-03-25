"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  ModuleRegistry,
  AllCommunityModule,
  type CellEditingStoppedEvent,
  type CellValueChangedEvent,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type SuppressKeyboardEventParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";

import { ProductCodeCellEditor } from "@/src/components/grid/ProductCodeCellEditor";
import type { CodeMasterItem } from "@/src/constants/mockData";
import { PARTIES, PRODUCTS } from "@/src/constants/mockData";
import type { OrderLine } from "@/src/types/order";

ModuleRegistry.registerModules([AllCommunityModule]);

type OrderLineRow = OrderLine & { lineNo: number };

const INITIAL_ROWS = 18;

function createEmptyRows(): OrderLineRow[] {
  return Array.from({ length: INITIAL_ROWS }, (_, i) => ({
    lineNo: i + 1,
    productCode: "",
    productName: "",
    quantity: 0,
    unitPrice: 0,
    amount: 0,
  }));
}

const EDIT_COLS = ["productCode", "quantity", "unitPrice"] as const;
/** Enter で確定＋右へ進めるのは数量・単価のみ（製品列はセレクトの Enter と競合するため） */
const ENTER_NAV_COL_KEYS = new Set<string>(["quantity", "unitPrice"]);

function findPartyByInput(raw: string): CodeMasterItem | null {
  const q = raw.trim();
  if (!q) return null;
  const byCode = PARTIES.find((p) => p.code === q);
  if (byCode) return byCode;
  const token = q.split(/\s+/)[0] ?? q;
  const byCodeToken = PARTIES.find((p) => p.code === token);
  if (byCodeToken) return byCodeToken;
  const lower = q.toLowerCase();
  const hits = PARTIES.filter(
    (p) =>
      p.code.toLowerCase().includes(lower) ||
      p.name.toLowerCase().includes(lower),
  );
  return hits.length === 1 ? hits[0]! : null;
}

/** Enter 確定用: 上記に加え、プルダウンと同じ絞り込みで候補が 1 件ならその取引先 */
function resolvePartyCommitFromInput(raw: string): CodeMasterItem | null {
  const fromFind = findPartyByInput(raw);
  if (fromFind) return fromFind;
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const filtered = PARTIES.filter(
    (o) =>
      o.code.toLowerCase().includes(q) ||
      o.name.toLowerCase().includes(q),
  );
  return filtered.length === 1 ? filtered[0]! : null;
}

function isAutocompleteListOpen(input: EventTarget | null): boolean {
  if (!(input instanceof HTMLInputElement)) return false;
  return input.getAttribute("aria-expanded") === "true";
}

/** JST の今日の暦日に add 日した日付を `YYYY-MM-DD` で返す（`input type="date"` 用） */
function formatJstCalendarDatePlusDays(addDays: number): string {
  const timeZone = "Asia/Tokyo";
  const now = new Date();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = dtf.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const rolled = new Date(Date.UTC(y, m - 1, d + addDays));
  const yy = rolled.getUTCFullYear();
  const mm = rolled.getUTCMonth() + 1;
  const dd = rolled.getUTCDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export default function OrderNewView() {
  const [contractParty, setContractParty] = useState<CodeMasterItem | null>(
    null,
  );
  const [deliveryParty, setDeliveryParty] = useState<CodeMasterItem | null>(
    null,
  );
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [forecastNumber, setForecastNumber] = useState("");

  const [contractInput, setContractInput] = useState("");
  const [deliveryInput, setDeliveryInput] = useState("");

  const [rowData, setRowData] = useState<OrderLineRow[]>(createEmptyRows);

  const gridApiRef = useRef<GridApi<OrderLineRow> | null>(null);
  const advanceRowOnStopRef = useRef(false);

  const refContract = useRef<HTMLInputElement | null>(null);
  const refDelivery = useRef<HTMLInputElement | null>(null);
  const refLocation = useRef<HTMLInputElement | null>(null);
  const refDue = useRef<HTMLInputElement | null>(null);
  const refForecast = useRef<HTMLInputElement | null>(null);

  const focusChain = useMemo(
    () => [
      () => refContract.current?.focus(),
      () => refDelivery.current?.focus(),
      () => refLocation.current?.focus(),
      () => refDue.current?.focus(),
      () => refForecast.current?.focus(),
      () => {
        const api = gridApiRef.current;
        if (!api) return;
        api.setFocusedCell(0, "productCode");
        api.startEditingCell({ rowIndex: 0, colKey: "productCode" });
      },
    ],
    [],
  );

  const focusNextHeader = useCallback(
    (index: number) => {
      const next = focusChain[index + 1];
      if (next) requestAnimationFrame(() => next());
    },
    [focusChain],
  );

  const handleNew = useCallback(() => {
    advanceRowOnStopRef.current = false;
    gridApiRef.current?.stopEditing(true);
    setContractParty(null);
    setDeliveryParty(null);
    setContractInput("");
    setDeliveryInput("");
    setDeliveryLocation("");
    setDueDate("");
    setForecastNumber("");
    setRowData(createEmptyRows());
    requestAnimationFrame(() => refContract.current?.focus());
  }, []);

  const handleSave = useCallback(() => {
    const header = {
      contractPartyCode: contractParty?.code ?? "",
      deliveryPartyCode: deliveryParty?.code ?? "",
      deliveryLocation,
      dueDate,
      forecastNumber,
    };
    const lines = rowData.filter(
      (r) => r.productCode.trim() !== "" || r.quantity > 0 || r.unitPrice > 0,
    );
    console.info("[保存モック]", { header, lines });
    alert("保存しました（コンソールにモック出力）");
    handleNew();
  }, [
    contractParty,
    deliveryParty,
    deliveryLocation,
    dueDate,
    forecastNumber,
    rowData,
    handleNew,
  ]);

  useEffect(() => {
    requestAnimationFrame(() => refContract.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        handleNew();
        return;
      }
      if (e.key === "F12") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleSave, handleNew]);

  const onGridReady = useCallback((e: GridReadyEvent<OrderLineRow>) => {
    gridApiRef.current = e.api;
  }, []);

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<OrderLineRow>) => {
      const { colDef, node, data } = e;
      if (!node || !data || !colDef.field) return;

      if (colDef.field === "productCode") {
        const raw = String(e.newValue ?? "").trim();
        const upper = raw.toUpperCase();
        const hit =
          PRODUCTS.find((p) => p.code === raw) ??
          PRODUCTS.find((p) => p.code.toUpperCase() === upper);
        node.setDataValue("productName", hit?.name ?? "");
        if (raw) {
          const row = node.rowIndex ?? 0;
          requestAnimationFrame(() => {
            e.api.setFocusedCell(row, "quantity");
            e.api.startEditingCell({ rowIndex: row, colKey: "quantity" });
          });
        }
      }

      if (colDef.field === "quantity" || colDef.field === "unitPrice") {
        const q = Number(data.quantity) || 0;
        const u = Number(data.unitPrice) || 0;
        node.setDataValue("amount", q * u);
      }
    },
    [],
  );

  const moveToNextCellAfterEdit = useCallback(
    (e: CellEditingStoppedEvent<OrderLineRow>) => {
      if (!advanceRowOnStopRef.current) return;
      advanceRowOnStopRef.current = false;

      const api = e.api;
      const colId = e.column.getColId();
      const idx = EDIT_COLS.indexOf(colId as (typeof EDIT_COLS)[number]);
      if (idx === -1) return;

      const row = e.node.rowIndex ?? 0;
      const nextIdx = idx + 1;

      if (nextIdx < EDIT_COLS.length) {
        const colKey = EDIT_COLS[nextIdx]!;
        api.setFocusedCell(row, colKey);
        api.startEditingCell({ rowIndex: row, colKey });
        return;
      }

      const nextRow = row + 1;
      const col0 = EDIT_COLS[0]!;
      const rowCount = api.getDisplayedRowCount();

      if (nextRow < rowCount) {
        api.setFocusedCell(nextRow, col0);
        api.startEditingCell({ rowIndex: nextRow, colKey: col0 });
        return;
      }

      setRowData((prev) => {
        const lineNo =
          prev.length > 0 ? Math.max(...prev.map((r) => r.lineNo)) + 1 : 1;
        const added: OrderLineRow = {
          lineNo,
          productCode: "",
          productName: "",
          quantity: 0,
          unitPrice: 0,
          amount: 0,
        };
        return [...prev, added];
      });

      setTimeout(() => {
        const api2 = gridApiRef.current;
        if (!api2) return;
        api2.setFocusedCell(nextRow, col0);
        api2.startEditingCell({ rowIndex: nextRow, colKey: col0 });
      }, 0);
    },
    [],
  );

  const suppressEnterWhileEditing = useCallback(
    (params: SuppressKeyboardEventParams<OrderLineRow, unknown>) => {
      if (!params.editing) return false;
      const ev = params.event;
      if (ev.key !== "Enter" || ev.shiftKey || ev.ctrlKey || ev.altKey) {
        return false;
      }
      const colId = params.column.getColId();
      // 製品コード: リスト展開中の Enter は MUI がハイライト確定に使う。先に AG Grid が処理すると未確定のまま編集終了する。
      if (colId === "productCode") {
        if (
          isAutocompleteListOpen(ev.target) ||
          isAutocompleteListOpen(
            typeof document !== "undefined" ? document.activeElement : null,
          )
        ) {
          return true;
        }
      }
      if (!ENTER_NAV_COL_KEYS.has(colId)) return false;
      ev.preventDefault();
      advanceRowOnStopRef.current = true;
      params.api.stopEditing(false);
      return true;
    },
    [],
  );

  const columnDefs = useMemo<ColDef<OrderLineRow>[]>(
    () => [
      {
        headerName: "行",
        field: "lineNo",
        width: 52,
        editable: false,
        pinned: "left",
      },
      {
        headerName: "製品コード",
        field: "productCode",
        width: 200,
        minWidth: 160,
        editable: true,
        singleClickEdit: true,
        cellEditor: ProductCodeCellEditor,
        cellEditorPopup: true,
        cellEditorPopupPosition: "over",
        valueFormatter: (p) => {
          const code = String(p.value ?? "").trim();
          if (!code) return "";
          const name = PRODUCTS.find((x) => x.code === code)?.name;
          return name ? `${code} ${name}` : code;
        },
        valueParser: (p) => {
          const s = String(p.newValue ?? "").trim();
          if (!s) return "";
          return s.toUpperCase();
        },
      },
      {
        headerName: "製品名",
        field: "productName",
        width: 220,
        editable: false,
        singleClickEdit: false,
      },
      {
        headerName: "数量",
        field: "quantity",
        width: 88,
        editable: true,
        singleClickEdit: true,
        type: "numericColumn",
        valueParser: (p) => {
          const v = p.newValue;
          if (v === "" || v == null) return 0;
          const n = Number(String(v).replace(/,/g, ""));
          return Number.isFinite(n) ? n : 0;
        },
      },
      {
        headerName: "単価",
        field: "unitPrice",
        width: 100,
        editable: true,
        singleClickEdit: true,
        type: "numericColumn",
        valueParser: (p) => {
          const v = p.newValue;
          if (v === "" || v == null) return 0;
          const n = Number(String(v).replace(/,/g, ""));
          return Number.isFinite(n) ? n : 0;
        },
      },
      {
        headerName: "金額",
        field: "amount",
        width: 112,
        editable: false,
        type: "numericColumn",
        valueFormatter: (p) =>
          p.value == null ? "" : Number(p.value).toLocaleString("ja-JP"),
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<OrderLineRow>>(
    () => ({
      sortable: false,
      filter: false,
      resizable: true,
      suppressHeaderMenuButton: true,
      suppressKeyboardEvent: suppressEnterWhileEditing,
    }),
    [suppressEnterWhileEditing],
  );

  const partyOptionLabel = (o: CodeMasterItem) => `${o.code} ${o.name}`;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#dfe6ec] text-slate-900">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-400 bg-[#cfd8e3] px-3 py-2">
        <Typography
          component="h1"
          variant="subtitle1"
          sx={{ fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700 }}
        >
          受注登録
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            onClick={handleNew}
            sx={{
              fontFamily: "var(--font-geist-mono), monospace",
              borderColor: "rgba(0,0,0,0.35)",
              bgcolor: "background.paper",
            }}
          >
            新規（F01）
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={handleSave}
            sx={{ fontFamily: "var(--font-geist-mono), monospace" }}
          >
            保存 (F12)
          </Button>
        </Box>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2">
          <Paper
            elevation={0}
            sx={{
              border: "1px solid #9aa7b8",
              borderRadius: 0,
              p: 1.5,
              bgcolor: "#eef2f6",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 1,
                fontFamily: "var(--font-geist-mono), monospace",
                color: "text.secondary",
              }}
            >
              ヘッダ（Enter で次項目）
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
                gap: 1.5,
              }}
            >
              <Autocomplete<CodeMasterItem>
                options={[...PARTIES]}
                value={contractParty}
                onChange={(_, v, reason) => {
                  setContractParty(v);
                  if (v) {
                    setContractInput(`${v.code} ${v.name}`);
                  } else {
                    setContractInput("");
                  }
                  if (reason === "selectOption") {
                    requestAnimationFrame(() => focusNextHeader(0));
                  }
                }}
                inputValue={contractInput}
                onInputChange={(_, v, reason) => {
                  if (reason === "input" || reason === "clear") {
                    setContractInput(v);
                  }
                  if (reason === "reset" && v !== "") {
                    setContractInput(v);
                  }
                }}
                selectOnFocus={false}
                blurOnSelect={false}
                handleHomeEndKeys
                getOptionLabel={partyOptionLabel}
                isOptionEqualToValue={(a, b) => a.code === b.code}
                filterOptions={(opts, state) => {
                  const q = state.inputValue.trim().toLowerCase();
                  if (!q) return opts;
                  return opts.filter(
                    (o) =>
                      o.code.toLowerCase().includes(q) ||
                      o.name.toLowerCase().includes(q),
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="契約先コード"
                    placeholder="例: 1001"
                    inputRef={refContract}
                    slotProps={{
                      htmlInput: {
                        ...params.inputProps,
                        autoComplete: "off",
                        onKeyDown: (
                          ev: React.KeyboardEvent<HTMLInputElement>,
                        ) => {
                          params.inputProps?.onKeyDown?.(ev);
                          if (ev.key !== "Enter" || ev.shiftKey) return;
                          const text = ev.currentTarget.value;
                          const hit = resolvePartyCommitFromInput(text);
                          if (hit) {
                            ev.preventDefault();
                            setContractParty(hit);
                            setContractInput(`${hit.code} ${hit.name}`);
                            requestAnimationFrame(() => focusNextHeader(0));
                            return;
                          }
                          if (isAutocompleteListOpen(ev.target)) return;
                          ev.preventDefault();
                          focusNextHeader(0);
                        },
                      },
                    }}
                  />
                )}
              />

              <Autocomplete<CodeMasterItem>
                options={[...PARTIES]}
                value={deliveryParty}
                onChange={(_, v, reason) => {
                  setDeliveryParty(v);
                  if (v) {
                    setDeliveryInput(`${v.code} ${v.name}`);
                  } else {
                    setDeliveryInput("");
                  }
                  if (reason === "selectOption") {
                    requestAnimationFrame(() => focusNextHeader(1));
                  }
                }}
                inputValue={deliveryInput}
                onInputChange={(_, v, reason) => {
                  if (reason === "input" || reason === "clear") {
                    setDeliveryInput(v);
                  }
                  if (reason === "reset" && v !== "") {
                    setDeliveryInput(v);
                  }
                }}
                selectOnFocus={false}
                blurOnSelect={false}
                handleHomeEndKeys
                getOptionLabel={partyOptionLabel}
                isOptionEqualToValue={(a, b) => a.code === b.code}
                filterOptions={(opts, state) => {
                  const q = state.inputValue.trim().toLowerCase();
                  if (!q) return opts;
                  return opts.filter(
                    (o) =>
                      o.code.toLowerCase().includes(q) ||
                      o.name.toLowerCase().includes(q),
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="納入先コード"
                    placeholder="例: 3001"
                    inputRef={refDelivery}
                    slotProps={{
                      htmlInput: {
                        ...params.inputProps,
                        autoComplete: "off",
                        onKeyDown: (
                          ev: React.KeyboardEvent<HTMLInputElement>,
                        ) => {
                          params.inputProps?.onKeyDown?.(ev);
                          if (ev.key !== "Enter" || ev.shiftKey) return;
                          const text = ev.currentTarget.value;
                          const hit = resolvePartyCommitFromInput(text);
                          if (hit) {
                            ev.preventDefault();
                            setDeliveryParty(hit);
                            setDeliveryInput(`${hit.code} ${hit.name}`);
                            requestAnimationFrame(() => focusNextHeader(1));
                            return;
                          }
                          if (isAutocompleteListOpen(ev.target)) return;
                          ev.preventDefault();
                          focusNextHeader(1);
                        },
                      },
                    }}
                  />
                )}
              />

              <TextField
                label="納入場所"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                inputRef={refLocation}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    ev.preventDefault();
                    focusNextHeader(2);
                  }
                }}
              />

              <TextField
                label="納期"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onFocus={() => {
                  setDueDate((prev) =>
                    prev === "" ? formatJstCalendarDatePlusDays(7) : prev,
                  );
                }}
                slotProps={{ inputLabel: { shrink: true } }}
                inputRef={refDue}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    ev.preventDefault();
                    focusNextHeader(3);
                  }
                }}
              />

              <TextField
                label="内示番号"
                value={forecastNumber}
                onChange={(e) => setForecastNumber(e.target.value)}
                inputRef={refForecast}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    ev.preventDefault();
                    focusNextHeader(4);
                  }
                }}
                sx={{ gridColumn: { md: "span 2" } }}
              />
            </Box>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              flex: 1,
              minHeight: 280,
              border: "1px solid #9aa7b8",
              borderRadius: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              bgcolor: "#f7f9fc",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.5,
                borderBottom: "1px solid #9aa7b8",
                fontFamily: "var(--font-geist-mono), monospace",
                color: "text.secondary",
              }}
            >
              明細（製品はコンボ入力＋リスト／確定で数量へ／数量・単価は Enter で右へ）
            </Typography>
            <div className="ag-theme-balham min-h-0 flex-1 p-1">
              <AgGridReact<OrderLineRow>
                theme="legacy"
                rowData={rowData}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                getRowId={(p) => String(p.data.lineNo)}
                singleClickEdit
                enterNavigatesVertically={false}
                enterNavigatesVerticallyAfterEdit={false}
                onGridReady={onGridReady}
                onCellValueChanged={onCellValueChanged}
                onCellEditingStopped={moveToNextCellAfterEdit}
              />
            </div>
          </Paper>
        </main>

        <Box
          component="aside"
          className="flex h-full min-h-0 w-[min(100%,380px)] shrink-0 flex-col border-l border-slate-400 bg-[#1e2a38]"
          sx={{ color: "#f1f5f9" }}
        >
          <Typography
            variant="subtitle2"
            color="inherit"
            sx={{
              borderBottom: "1px solid #3d4f63",
              px: 1.5,
              py: 1,
              fontFamily: "var(--font-geist-mono), monospace",
              flexShrink: 0,
            }}
          >
            AI エージェント助言
          </Typography>
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              p: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 1.2,
              color: "inherit",
            }}
          >
            {[
              "納期がタイトです。前工程のロットと突合してください。",
              "入力中の単価は過去 6 か月平均より約 8% 低いです。",
              "△△電池工業向けはリコール履歴があるロットを避ける運用が推奨です。",
              "B002（鉛蓄電池パック）は在庫閾値を下回る見込みです。",
            ].map((text) => (
              <Paper
                key={text}
                elevation={0}
                sx={{
                  p: 1,
                  bgcolor: "#2a3a4d",
                  borderLeft: "3px solid #5ab0ff",
                  borderRadius: 0.5,
                  color: "#f8fafc",
                }}
              >
                <Typography
                  variant="body2"
                  color="inherit"
                  sx={{ fontSize: 13, lineHeight: 1.5 }}
                >
                  {text}
                </Typography>
              </Paper>
            ))}
            <Typography
              variant="caption"
              sx={{ mt: 0.5, color: "rgba(255,255,255,0.72)" }}
            >
              ※ダミー表示です。実装時はルール／学習モデルと連携してください。
            </Typography>

            <Typography
              variant="subtitle2"
              color="inherit"
              sx={{
                mt: 1.5,
                pt: 1.5,
                borderTop: "1px solid #3d4f63",
                fontFamily: "var(--font-geist-mono), monospace",
              }}
            >
              モックマスタ参照
            </Typography>
            <Typography
              variant="caption"
              sx={{ mb: 0.5, color: "rgba(255,255,255,0.78)" }}
            >
              取引先（契約先・納入先）
            </Typography>
            <Paper
              elevation={0}
              sx={{
                p: 1,
                bgcolor: "#243040",
                borderRadius: 0.5,
                border: "1px solid #3d4f63",
                color: "#f8fafc",
              }}
            >
              <Box
                component="ul"
                sx={{
                  m: 0,
                  pl: 1.5,
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: "inherit",
                }}
              >
                {PARTIES.map((p) => (
                  <Box
                    component="li"
                    key={p.code}
                    sx={{ listStyle: "disc", color: "inherit" }}
                  >
                    {p.code}：{p.name}
                  </Box>
                ))}
              </Box>
            </Paper>
            <Typography
              variant="caption"
              sx={{ mb: 0.5, color: "rgba(255,255,255,0.78)" }}
            >
              製品（明細）
            </Typography>
            <Paper
              elevation={0}
              sx={{
                p: 1,
                bgcolor: "#243040",
                borderRadius: 0.5,
                border: "1px solid #3d4f63",
                color: "#f8fafc",
              }}
            >
              <Box
                component="ul"
                sx={{
                  m: 0,
                  pl: 1.5,
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: "inherit",
                }}
              >
                {PRODUCTS.map((p) => (
                  <Box
                    component="li"
                    key={p.code}
                    sx={{ listStyle: "disc", color: "inherit" }}
                  >
                    {p.code}：{p.name}
                  </Box>
                ))}
              </Box>
            </Paper>
          </Box>
        </Box>
      </div>
    </div>
  );
}
