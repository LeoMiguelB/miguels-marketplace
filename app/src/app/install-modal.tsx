"use client";

import { useEffect, useState } from "react";
import {
  checkboxEnabled,
  downloadEnabled,
  emptyInstallFields,
  submitDownload,
  tncAtEnd,
  type InstallFields,
  type Role,
} from "@/lib/install-form";
import { TERMS } from "@/lib/terms";

export function InstallModal({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<InstallFields>(emptyInstallFields);
  const [tncUnlocked, setTncUnlocked] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patch<K extends keyof InstallFields>(key: K, value: InstallFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const canCheck = checkboxEnabled(tncUnlocked);
  const canDownload = downloadEnabled({ email: fields.email, accepted });

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-[min(420px,calc(100%-2rem))] border border-on bg-bg p-3.5 text-xs text-fg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="font-bold">INSTALL · {title}</h2>
          <button type="button" onClick={onClose} className="text-on">
            ✕
          </button>
        </div>
        <div
          className="mb-2 h-[72px] overflow-y-auto border border-line p-2 text-[9px] leading-snug text-on"
          onScroll={(event) => {
            if (tncAtEnd(event.currentTarget)) setTncUnlocked(true);
          }}
        >
          {TERMS}
        </div>
        <label className="mb-1 block text-[10px] text-on">
          email
          <input
            className="mt-0.5 w-full border border-line bg-bg px-1 py-1 text-fg"
            value={fields.email}
            onChange={(event) => patch("email", event.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="mb-1 block text-[10px] text-on">
          name
          <input
            className="mt-0.5 w-full border border-line bg-bg px-1 py-1 text-fg"
            value={fields.name}
            onChange={(event) => patch("name", event.target.value)}
          />
        </label>
        <label className="mb-1 block text-[10px] text-on">
          role
          <select
            className="mt-0.5 w-full border border-line bg-bg px-1 py-1 text-fg"
            value={fields.role}
            onChange={(event) => patch("role", event.target.value as Role)}
          >
            <option value=""></option>
            <option value="producer">producer</option>
            <option value="artist">artist</option>
            <option value="other">other</option>
          </select>
        </label>
        <label className="mb-1 block text-[10px] text-on">
          instagram
          <input
            className="mt-0.5 w-full border border-line bg-bg px-1 py-1 text-fg"
            value={fields.instagram}
            onChange={(event) => patch("instagram", event.target.value)}
          />
        </label>
        <label className="mb-2 block text-[10px] text-on">
          x
          <input
            className="mt-0.5 w-full border border-line bg-bg px-1 py-1 text-fg"
            value={fields.x}
            onChange={(event) => patch("x", event.target.value)}
          />
        </label>
        <label className="mb-2 flex items-center gap-2 text-[10px]">
          <input
            type="checkbox"
            disabled={!canCheck}
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          I have read and accept
        </label>
        <button
          type="button"
          disabled={!canDownload}
          onClick={() => setStatus(submitDownload().status)}
          className="w-full border border-fg py-1.5 text-[10px] disabled:border-line disabled:text-on"
        >
          DOWNLOAD
        </button>
        {status === "DOWNLOAD_UNAVAILABLE" ? (
          <p className="mt-2 text-on">DOWNLOAD_UNAVAILABLE</p>
        ) : null}
      </div>
    </div>
  );
}
