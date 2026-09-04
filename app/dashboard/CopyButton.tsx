"use client";

import { useState, useRef, useEffect } from "react";

export interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  failedLabel?: string;
  className?: string;
  "aria-label"?: string;
}

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  failedLabel = "Failed",
  className = "btn btn-ghost text-xs",
  "aria-label": ariaLabel,
}: CopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }

    timeoutRef.current = setTimeout(() => {
      setStatus("idle");
    }, 1500);
  }

  const currentText =
    status === "copied"
      ? copiedLabel
      : status === "failed"
      ? failedLabel
      : label;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-label={ariaLabel ?? (status === "copied" ? `${label} - ${copiedLabel}` : label)}
      aria-live="polite"
    >
      {currentText}
    </button>
  );
}
