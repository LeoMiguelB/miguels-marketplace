export type Role = "" | "producer" | "artist" | "other";

export type InstallFields = {
  email: string;
  name: string;
  role: Role;
  instagram: string;
  x: string;
};

export const emptyInstallFields: InstallFields = {
  email: "",
  name: "",
  role: "",
  instagram: "",
  x: "",
};

export function emailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function tncAtEnd(box: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): boolean {
  return box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
}

export function checkboxEnabled(tncUnlocked: boolean): boolean {
  return tncUnlocked;
}

export function downloadEnabled(input: { email: string; accepted: boolean }): boolean {
  return emailValid(input.email) && input.accepted;
}

export function submitDownload(): { status: "DOWNLOAD_UNAVAILABLE" } {
  return { status: "DOWNLOAD_UNAVAILABLE" };
}
