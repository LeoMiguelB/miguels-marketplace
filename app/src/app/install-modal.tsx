"use client";

import { useEffect, useState } from "react";
import {
  checkboxEnabled,
  downloadEnabled,
  emailValid,
  emptyInstallFields,
  submitDownload,
  tncAtEnd,
  type InstallFields,
  type Role,
} from "@/lib/install-form";
import { TERMS } from "@/lib/terms";

export function InstallModal({
  trackId,
  title,
  onClose,
}: {
  trackId: number;
  title: string;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<InstallFields>(emptyInstallFields);
  const [tncUnlocked, setTncUnlocked] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; terms?: string; general?: string }>({});
  const [loading, setLoading] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(false);

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

  async function handleDownload() {
    const nextErrors: { email?: string; terms?: string; general?: string } = {};

    if (!fields.email || !emailValid(fields.email)) {
      nextErrors.email = "Please provide a valid email address";
    }
    if (!accepted) {
      nextErrors.terms = "Please read and accept the terms";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    setErrors({});
    const res = await submitDownload(fields, trackId);
    if (res.status === "DOWNLOAD_SUCCESS") {
      window.location.href = res.url;
      setTimeout(() => onClose(), 1000);
    } else {
      setErrors({ general: res.status });
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[min(420px,calc(100%-2rem))] border border-on bg-bg p-3.5 text-xs text-fg"
        onClick={(event) => event.stopPropagation()}
      >
        {viewingPdf ? (
          <div className="flex h-[400px] flex-col">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="font-bold">SAMPLE CLEARANCE</h2>
              <div className="flex gap-4">
                <button type="button" onClick={() => setViewingPdf(false)} className="text-on hover:text-fg hover:underline">
                  BACK
                </button>
                <button type="button" onClick={onClose} className="text-on hover:text-fg">
                  ✕
                </button>
              </div>
            </div>
            <iframe src="/sample-clearance.pdf" className="w-full flex-1 border border-line bg-white" />
          </div>
        ) : (
          <>
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="font-bold">INSTALL · {title}</h2>
              <button type="button" onClick={onClose} className="text-on">
                ✕
              </button>
            </div>
            <button 
              type="button" 
              className="mb-2 w-full border border-line py-1 text-[10px] text-on hover:border-fg hover:text-fg"
              onClick={() => setViewingPdf(true)}
            >
              Click here to view sample clearance
            </button>
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
                className={`mt-0.5 w-full border ${errors.email ? "border-red-500" : "border-line"} bg-bg px-1 py-1 text-fg`}
                value={fields.email}
                onChange={(event) => {
                  patch("email", event.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                autoComplete="email"
              />
              {errors.email ? (
                <span className="mt-0.5 block text-[9px] text-red-500">{errors.email}</span>
              ) : null}
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
            <div className="mb-2">
              <label className="flex items-center gap-2 text-[10px]">
                <input
                  type="checkbox"
                  disabled={!canCheck}
                  checked={accepted}
                  onChange={(event) => {
                    setAccepted(event.target.checked);
                    if (errors.terms) setErrors((prev) => ({ ...prev, terms: undefined }));
                  }}
                />
                I have read and accept
              </label>
              {errors.terms ? (
                <span className="mt-0.5 block text-[9px] text-red-500">{errors.terms}</span>
              ) : null}
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleDownload}
              className="w-full border border-fg py-1.5 text-[10px] disabled:border-line disabled:text-on"
            >
              {loading ? "DOWNLOADING..." : "DOWNLOAD"}
            </button>
            {errors.general ? (
              <p className="mt-2 text-[10px] text-red-500">{errors.general}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
