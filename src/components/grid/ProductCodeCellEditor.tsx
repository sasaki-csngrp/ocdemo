"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import type { CustomCellEditorProps } from "ag-grid-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { CodeMasterItem } from "@/src/constants/mockData";
import { PRODUCTS } from "@/src/constants/mockData";

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function matchProduct(raw: string): CodeMasterItem | null {
  const q = raw.trim();
  if (!q) return null;
  const u = q.toUpperCase();
  return (
    PRODUCTS.find((p) => p.code === q) ??
    PRODUCTS.find((p) => p.code.toUpperCase() === u) ??
    null
  );
}

function initFromInitial(
  initial: string | null | undefined,
): { selected: CodeMasterItem | null; input: string } {
  const raw = String(initial ?? "").trim();
  if (!raw) return { selected: null, input: "" };
  const hit = matchProduct(raw);
  if (hit) return { selected: hit, input: `${hit.code} ${hit.name}` };
  return { selected: null, input: raw };
}

function isListOpen(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement)) return false;
  return target.getAttribute("aria-expanded") === "true";
}

export function ProductCodeCellEditor(
  props: CustomCellEditorProps<unknown, string, unknown>,
) {
  const { onValueChange, stopEditing, onKeyDown } = props;

  const start = initFromInitial(props.value ?? props.initialValue);
  const [selected, setSelected] = useState<CodeMasterItem | null>(start.selected);
  const [inputValue, setInputValue] = useState(start.input);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const push = useCallback(
    (raw: string) => {
      onValueChange(normalizeCode(raw));
    },
    [onValueChange],
  );

  useEffect(() => {
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const optionLabel = useCallback((o: CodeMasterItem | string) => {
    if (typeof o === "string") return o;
    return `${o.code} ${o.name}`;
  }, []);

  const editorMinWidth = 400;

  return (
    <Box
      sx={{
        minWidth: editorMinWidth,
        width: "max(100%, 400px)",
        maxWidth: "min(520px, calc(100vw - 24px))",
        py: 0.25,
      }}
    >
      <Autocomplete
      freeSolo
      fullWidth
      size="small"
      options={[...PRODUCTS]}
      value={selected}
      inputValue={inputValue}
      onChange={(_, v) => {
        if (v && typeof v !== "string") {
          setSelected(v);
          setInputValue(`${v.code} ${v.name}`);
          push(v.code);
          // キーボードで候補確定した直後も 1 回の Enter でコミットできるよう、次ティックで編集終了
          queueMicrotask(() => stopEditing(false));
          return;
        }
        setSelected(null);
        const t = typeof v === "string" ? v : "";
        setInputValue(t);
        push(t);
        // 候補リスト表示中に Enter した結果が「自由入力(string)」扱いの場合、
        // ここで編集終了しないと 2 回目の Enter が必要になることがあるため停止する。
        queueMicrotask(() => stopEditing(false));
      }}
      onInputChange={(_, v, reason) => {
        if (reason === "input") {
          setInputValue(v);
          push(v);
        }
        if (reason === "clear") {
          setSelected(null);
          setInputValue("");
          push("");
        }
      }}
      getOptionLabel={(o) => optionLabel(o)}
      isOptionEqualToValue={(a, b) => {
        if (typeof a === "string" || typeof b === "string") return false;
        return a.code === b.code;
      }}
      filterOptions={(opts, state) => {
        const q = state.inputValue.trim().toLowerCase();
        if (!q) return opts;
        return opts.filter(
          (o) =>
            o.code.toLowerCase().includes(q) ||
            o.name.toLowerCase().includes(q),
        );
      }}
      selectOnFocus={false}
      handleHomeEndKeys
      openOnFocus
      blurOnSelect={false}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          inputRef={inputRef}
          sx={{
            "& .MuiInputBase-input": {
              textOverflow: "clip",
            },
          }}
          onKeyDown={(ev) => {
            params.inputProps?.onKeyDown?.(
              ev as ReactKeyboardEvent<HTMLInputElement>,
            );
            if (ev.key === "Enter" && !ev.shiftKey) {
              if (isListOpen(ev.target)) return;
              ev.preventDefault();
              stopEditing(false);
              return;
            }
            if (ev.key === "Tab") {
              onKeyDown(ev.nativeEvent);
            }
          }}
        />
      )}
      slotProps={{
        popper: {
          placement: "bottom-start",
          sx: {
            zIndex: 2500,
            minWidth: editorMinWidth,
          },
        },
        paper: {
          // セルエディタがポップアップのとき、子のドロップダウンを「同一ポップアップ内」と認識させる
          className: "ag-custom-component-popup",
          sx: {
            minWidth: editorMinWidth,
            maxWidth: "min(520px, calc(100vw - 24px))",
          },
        },
        listbox: {
          sx: {
            maxHeight: 280,
            py: 0,
            "& .MuiAutocomplete-option": {
              whiteSpace: "nowrap",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          },
        },
      }}
    />
    </Box>
  );
}
