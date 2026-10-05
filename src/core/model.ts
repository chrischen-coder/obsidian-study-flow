export type Kind = "book" | "excerpt" | "card";
export interface BaseRecord {
  id: string;
  kind: Kind;
  path: string;
  revision: string;
}
export interface Book extends BaseRecord {
  kind: "book";
  pdfPath: string;
  title: string;
  category: string;
  page: number;
  totalPages: number;
  lastReadAt: string;
  status: "reading" | "paused" | "done";
}
export interface Excerpt extends BaseRecord {
  kind: "excerpt";
  bookId: string;
  pdfPath?: string;
  bookPath?: string;
  page: number;
  subpath: string;
  quote: string;
  reflection: string;
  state: "inbox" | "understood" | "archived";
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  legacySource?: string;
}
export interface Card extends BaseRecord {
  kind: "card";
  excerptId: string;
  bookId: string;
  cardType: "pdf" | "text" | "screenshot";
  status: "draft" | "active";
  question: string;
  answer: string;
  deckTag: string;
  source: string;
  excerptPath: string;
  separator: string;
  schedule: string;
  createdAt: string;
  updatedAt: string;
}
export type Record = Book | Excerpt | Card;
export interface SelectionSnapshot {
  pdfPath: string;
  title: string;
  page: number;
  totalPages: number;
  subpath: string;
  text: string;
}
export interface ProgressSnapshot {
  pdfPath: string;
  title: string;
  page: number;
  totalPages: number;
  subpath: string;
}
export interface Category {
  label: string;
  value: string;
  folder: string;
  tag: string;
}
export interface Deck {
  label: string;
  tag: string;
}
export interface Settings {
  schemaVersion: 1;
  language: "auto" | "zh" | "en";
  cardFolder: string;
  attachmentFolder: string;
  excerptFolder: string;
  shelfPath: string;
  pdfCategories: Category[];
  decks: Deck[];
  defaultCategory: string;
  defaultDeck: string;
  onboardingDone: boolean;
  autoProgress: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  language: "auto",
  cardFolder: "01_记忆卡片",
  attachmentFolder: "99_附件",
  excerptFolder: "02_PDF学习/摘录",
  shelfPath: "02_PDF学习/PDF书架.md",
  pdfCategories: [
    {
      label: "读书",
      value: "读书",
      folder: "02_PDF学习/读书",
      tag: "学习/读书",
    },
    {
      label: "考试",
      value: "考试",
      folder: "02_PDF学习/考试",
      tag: "学习/考试",
    },
    {
      label: "课程",
      value: "课程",
      folder: "02_PDF学习/课程",
      tag: "学习/课程",
    },
  ],
  decks: [
    { label: "读书 / 要点", tag: "flashcards/读书/要点" },
    { label: "通用 / 概念", tag: "flashcards/通用/概念" },
    { label: "考试 / 易错", tag: "flashcards/考试/易错" },
  ],
  defaultCategory: "读书",
  defaultDeck: "flashcards/读书/要点",
  onboardingDone: false,
  autoProgress: true,
};
export interface FileInfo {
  path: string;
  knownKind?: string;
  legacy?: boolean;
}
export interface VaultPort {
  list(): FileInfo[];
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  create(path: string, text: string): Promise<void>;
  process(path: string, transform: (text: string) => string): Promise<void>;
  createBinary(path: string, bytes: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
}
export interface YamlPort {
  parse(text: string): unknown;
  stringify(data: object): string;
}
export interface SaveResult {
  status: "created" | "updated" | "unchanged";
  id: string;
  path: string;
  warnings: string[];
}
export class FlowError extends Error {
  constructor(
    public code: "invalid" | "conflict" | "missing" | "unsupported",
    message: string,
  ) {
    super(message);
    this.name = "FlowError";
  }
}
export function hasText(value: string): boolean {
  return value.replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, "").length > 0;
}
export function validPath(path: string): string {
  if (
    !path ||
    path !== path.trim() ||
    /^[\\/]/.test(path) ||
    /[\\:#|\[\]\r\n]/.test(path) ||
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.endsWith(".") ||
          part.endsWith(" ") ||
          /[<>"?*]/.test(part) ||
          /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part),
      )
  )
    throw new FlowError("invalid", `Invalid vault-relative path: ${path}`);
  return path;
}
export function validateSettings(settings: Settings): Settings {
  for (const path of [
    settings.cardFolder,
    settings.attachmentFolder,
    settings.excerptFolder,
    settings.shelfPath,
    ...settings.pdfCategories.map((c) => c.folder),
  ])
    validPath(path);
  if (
    !settings.shelfPath.endsWith(".md") ||
    !settings.decks.length ||
    !settings.pdfCategories.length
  )
    throw new FlowError(
      "invalid",
      "Folders, categories and decks are required.",
    );
  if (
    !settings.pdfCategories.some((c) => c.value === settings.defaultCategory) ||
    !settings.decks.some((d) => d.tag === settings.defaultDeck)
  )
    throw new FlowError("invalid", "Default category/deck must exist.");
  for (const item of [...settings.decks, ...settings.pdfCategories])
    if (!hasText(item.label) || !/^[^\s#|\[\]:]+$/.test(item.tag))
      throw new FlowError("invalid", "Invalid category or deck tag.");
  if (
    new Set(settings.pdfCategories.map((c) => c.value)).size !==
      settings.pdfCategories.length ||
    new Set(settings.decks.map((d) => d.tag)).size !== settings.decks.length
  )
    throw new FlowError("invalid", "Duplicate category or deck.");
  return settings;
}
export function settingsFrom(value: unknown): Settings {
  const defaults = structuredClone(DEFAULT_SETTINGS);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return defaults;
  const raw = value as { [key: string]: unknown };
  for (const key of [
    "cardFolder",
    "attachmentFolder",
    "excerptFolder",
    "shelfPath",
    "defaultCategory",
    "defaultDeck",
  ] as const)
    if (typeof raw[key] === "string") defaults[key] = raw[key];
  if (raw.language === "zh" || raw.language === "en")
    defaults.language = raw.language;
  for (const key of ["autoProgress", "onboardingDone"] as const)
    if (typeof raw[key] === "boolean") defaults[key] = raw[key];
  if (
    Array.isArray(raw.pdfCategories) &&
    raw.pdfCategories.every(
      (c) =>
        c &&
        typeof c === "object" &&
        ["label", "value", "folder", "tag"].every(
          (k) => typeof c[k] === "string",
        ),
    )
  )
    defaults.pdfCategories = raw.pdfCategories as Category[];
  if (
    Array.isArray(raw.decks) &&
    raw.decks.every(
      (d) =>
        d &&
        typeof d === "object" &&
        typeof d.label === "string" &&
        typeof d.tag === "string",
    )
  )
    defaults.decks = raw.decks as Deck[];
  if (!defaults.pdfCategories.some((c) => c.value === defaults.defaultCategory))
    defaults.defaultCategory = defaults.pdfCategories[0]?.value ?? "";
  if (!defaults.decks.some((d) => d.tag === defaults.defaultDeck))
    defaults.defaultDeck = defaults.decks[0]?.tag ?? "";
  return validateSettings(defaults);
}
export function safeName(text: string): string {
  return (
    text
      .replace(/[\\/:*?"<>|#[\]^]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48)
      .replace(/[. ]+$/, "") || "Study Flow"
  );
}
export function revision(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
