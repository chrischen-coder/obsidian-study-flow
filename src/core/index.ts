import {
  type Record,
  type Book,
  type Excerpt,
  type Card,
  type VaultPort,
  type YamlPort,
  type Settings,
  FlowError,
} from "./model";
import { parseRecord } from "./markdown";
export class LearningIndex {
  records = new Map<string, Record>();
  errors = new Map<string, string>();
  private subscribers = new Set<() => void>();
  private pending = new Map<string, number>();
  private disposed = false;
  constructor(
    private vault: VaultPort,
    private yaml: YamlPort,
    private settings: () => Settings,
  ) {}
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  private emit(): void {
    if (!this.disposed) this.subscribers.forEach((cb) => cb());
  }
  async initialize(): Promise<void> {
    const settings = this.settings();
    const roots = [
      settings.excerptFolder,
      settings.cardFolder,
      ...settings.pdfCategories.map((c) => c.folder),
    ];
    const files = this.vault
      .list()
      .filter(
        (f) =>
          !f.path.startsWith("StudyFlow/upgrade-backups/") &&
          f.path.endsWith(".md") &&
          (f.knownKind ||
            f.legacy ||
            roots.some((root) => f.path.startsWith(`${root}/`))),
      );
    for (const path of this.records.keys())
      if (!this.vault.exists(path)) this.remove(path);
    let next = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < files.length && !this.disposed) {
          const file = files[next++];
          if (file) await this.refresh(file.path, false);
        }
      }),
    );
    this.emit();
  }
  async refresh(path: string, notify = true): Promise<void> {
    const generation = (this.pending.get(path) ?? 0) + 1;
    this.pending.set(path, generation);
    if (!this.vault.exists(path)) {
      this.records.delete(path);
      this.errors.delete(path);
      if (notify) this.emit();
      return;
    }
    try {
      const text = await this.vault.read(path);
      if (this.pending.get(path) !== generation || this.disposed) return;
      const record = parseRecord(path, text, this.yaml);
      if (record) this.records.set(path, record);
      else this.records.delete(path);
      this.errors.delete(path);
    } catch (e) {
      if (this.pending.get(path) !== generation || this.disposed) return;
      this.records.delete(path);
      this.errors.set(path, e instanceof Error ? e.message : String(e));
    }
    if (notify) this.emit();
  }
  remove(path: string): void {
    this.pending.set(path, (this.pending.get(path) ?? 0) + 1);
    this.records.delete(path);
    this.errors.delete(path);
    this.emit();
  }
  get(id: string): Record | undefined {
    const records = [...this.records.values()].filter((r) => r.id === id);
    if (records.length > 1)
      throw new FlowError(
        "unsupported",
        "Duplicate learning IDs found. Keep one original or assign a new ID to the copied file before editing.",
      );
    return records[0];
  }
  get issues(): Map<string, string> {
    const issues = new Map(this.errors),
      ids = new Map<string, string[]>();
    for (const record of this.records.values())
      ids.set(record.id, [...(ids.get(record.id) ?? []), record.path]);
    for (const paths of ids.values())
      if (paths.length > 1)
        for (const path of paths)
          issues.set(
            path,
            "Duplicate learning ID. Keep the original or assign a new ID to the copied file before editing.",
          );
    return issues;
  }
  books(): Book[] {
    return [...this.records.values()]
      .filter((r): r is Book => r.kind === "book")
      .sort((a, b) => b.lastReadAt.localeCompare(a.lastReadAt));
  }
  excerpts(): Excerpt[] {
    return [...this.records.values()]
      .filter((r): r is Excerpt => r.kind === "excerpt")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  cards(): Card[] {
    return [...this.records.values()].filter(
      (r): r is Card => r.kind === "card",
    );
  }
  dispose(): void {
    this.disposed = true;
    this.subscribers.clear();
    this.pending.clear();
  }
}
