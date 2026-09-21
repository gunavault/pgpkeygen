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
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="lnk" onClick={handleDownload}>
      {label}
    </button>
  );
}
