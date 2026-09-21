"use client";

export function DownloadButton({
  text,
  filename,
  label = "Download",
}: {
  text: string;
  filename: string;
  label?: string;
}) {
  function handleDownload() {
    const blob = new Blob([text], { type: "application/pgp-keys;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <button type="button" className="lnk" onClick={handleDownload}>
      {label}
    </button>
  );
}
