"use client";

import { useState, useRef, useEffect } from "react";
import { ExportableKey, exportKeysToJSON, exportKeysToCSV, downloadFile } from "@/lib/export-keys";

export function ExportKeysButton({ keys }: { keys: ExportableKey[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExportJSON = () => {
    const json = exportKeysToJSON(keys);
    downloadFile(json, "pgp-keys-export.json", "application/json");
    setOpen(false);
  };

  const handleExportCSV = () => {
    const csv = exportKeysToCSV(keys);
    downloadFile(csv, "pgp-keys-export.csv", "text/csv;charset=utf-8;");
    setOpen(false);
  };

  const hasKeys = keys.length > 0;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        disabled={!hasKeys}
        onClick={() => setOpen((prev) => !prev)}
        className="btn btn-secondary whitespace-nowrap"
        title={hasKeys ? "Export key vault" : "No keys available to export"}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
      </button>

      {open && hasKeys && (
        <div
          className="absolute right-0 mt-1.5 w-40 z-10 flex flex-col py-1"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-divider)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <button
            type="button"
            onClick={handleExportJSON}
            className="px-3.5 py-2 text-left text-xs font-semibold cursor-pointer flex items-center justify-between"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <span>Export JSON</span>
            <span className="mono text-[10px] text-muted">.json</span>
          </button>
          <div style={{ height: 1, background: "var(--color-divider)", margin: "2px 0" }} />
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 text-left text-xs font-semibold cursor-pointer flex items-center justify-between"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <span>Export CSV</span>
            <span className="mono text-[10px] text-muted">.csv</span>
          </button>
        </div>
      )}
    </div>
  );
}
