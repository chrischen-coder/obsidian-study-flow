import {
  type Settings,
  type VaultPort,
  type YamlPort,
  type Book,
  type Excerpt,
  type Card,
  type Record,
  type SelectionSnapshot,
  type ProgressSnapshot,
  type SaveResult,
  FlowError,
  hasText,
  safeName,
  digest,
  validPath,
} from "./model";
import { parseRecord, serialize, frontmatter, unwrapLink } from "./markdown";
import { LearningIndex } from "./index";
export class LearningService {
  readonly index: LearningIndex;
  private locks = new Map<string, Promise<unknown>>();
  constructor(
    readonly vault: VaultPort,
    readonly yaml: YamlPort,
    readonly settings: () => Settings,
  ) {
    this.index = new LearningIndex(vault, yaml, settings);
  }
  private async locked<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    this.locks.set(key, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
  async read(id: string): Promise<Record> {
    const record = this.index.get(id);
    if (!record || !this.vault.exists(record.path))
      throw new FlowError("missing", "Learning file is missing.");
    const latest = parseRecord(
      record.path,
      await this.vault.read(record.path),
      this.yaml,
    );
    if (!latest)
      throw new FlowError("unsupported", "Learning file format changed.");
    return latest;
  }
  private async save(record: Record, expected?: string): Promise<SaveResult> {
    let status: SaveResult["status"] = "created";
    if (this.vault.exists(record.path)) {
      status = "updated";
      await this.vault.process(record.path, (text) => {
        const current = parseRecord(record.path, text, this.yaml);
        if (!current || current.id !== record.id)
          throw new FlowError(
            "conflict",
            "File identity changed; your draft was kept.",
          );
        if (expected && current.revision !== expected)
          throw new FlowError(
            "conflict",
            "This content was edited elsewhere; your draft was kept.",
          );
        if (
          record.kind === "card" &&
          current.kind === "card" &&
          current.status === "active" &&
          record.status === "draft"
        )
          throw new FlowError(
            "unsupported",
            "Published cards keep their review progress. Edit and save the active card instead of converting it to a draft.",
          );
        if (record.kind === "card" && current.kind === "card")
          record.schedule = current.schedule;
        const next = serialize(record, this.yaml, text);
        if (next === text) status = "unchanged";
        return next;
      });
    } else {
      if (expected)
        throw new FlowError(
          "missing",
          "The file was removed while editing; your draft was kept.",
        );
      await this.vault.create(record.path, serialize(record, this.yaml));
    }
    const warnings: string[] = [];
    await this.index.refresh(record.path);
    if (this.index.errors.has(record.path))
      warnings.push("Saved; index refresh failed. Rebuild the index.");
    return { status, id: record.id, path: record.path, warnings };
  }
  // Background updates change only their own fields inside Vault.process().
  private async patch(
    id: string,
    edit: (current: Record) => Record,
  ): Promise<SaveResult> {
    return this.locked(id, async () => {
      const record = this.index.get(id);
      if (!record) throw new FlowError("missing", "Learning file is missing.");
      let status: SaveResult["status"] = "updated";
      await this.vault.process(record.path, (text) => {
        const current = parseRecord(record.path, text, this.yaml);
        if (!current || current.id !== id)
          throw new FlowError("conflict", "File identity changed.");
        const next = serialize(edit(current), this.yaml, text);
        if (next === text) status = "unchanged";
        return next;
      });
      await this.index.refresh(record.path);
      return {
        status,
        id,
        path: record.path,
        warnings: this.index.errors.has(record.path)
          ? ["Saved; index refresh failed. Rebuild the index."]
          : [],
      };
    });
  }
  async ensureBook(snapshot: ProgressSnapshot): Promise<Book> {
    validPath(snapshot.pdfPath);
    if (
      !snapshot.pdfPath.toLowerCase().endsWith(".pdf") ||
      !Number.isInteger(snapshot.page) ||
      snapshot.page < 1
    )
      throw new FlowError("invalid", "Invalid PDF or page.");
    return this.locked(`book:${snapshot.pdfPath}`, async () => {
      const found = this.index
        .books()
        .find((b) => b.pdfPath === snapshot.pdfPath);
      if (found) return (await this.read(found.id)) as Book;
      // A legacy note must be adopted with a preview/backup, rather than silently replaced.
      for (const info of this.vault
        .list()
        .filter(
          (f) => f.legacy && !f.path.startsWith("StudyFlow/upgrade-backups/"),
        )) {
        const { data } = frontmatter(
          await this.vault.read(info.path),
          this.yaml,
        );
        if (
          data["类型"] === "PDF学习" &&
          unwrapLink(data["PDF文件"]) === snapshot.pdfPath
        )
          throw new FlowError(
            "unsupported",
            "Upgrade this legacy PDF note from the workbench first. Its original contents will be backed up.",
          );
      }
      const category = this.settings().pdfCategories.find(
        (c) => c.value === this.settings().defaultCategory,
      );
      if (!category)
        throw new FlowError(
          "invalid",
          "Choose a default category in settings.",
        );
      const id = crypto.randomUUID();
      const book: Book = {
        id,
        kind: "book",
        path: `${category.folder}/${safeName(snapshot.title)}-学习卡-${id.slice(0, 8)}.md`,
        revision: "",
        pdfPath: snapshot.pdfPath,
        title: snapshot.title,
        category: category.value,
        page: snapshot.page,
        totalPages: snapshot.totalPages,
        lastReadAt: new Date().toISOString(),
        status: "reading",
      };
      await this.save(book);
      return (await this.read(id)) as Book;
    });
  }
  async capture(snapshot: SelectionSnapshot): Promise<SaveResult> {
    if (!hasText(snapshot.text) || !snapshot.subpath.includes("selection="))
      throw new FlowError("invalid", "Select text in the current PDF first.");
    const params = new URLSearchParams(snapshot.subpath.replace(/^#/, ""));
    if (
      Number(params.get("page")) !== snapshot.page ||
      !/^\d+,\d+,\d+,\d+$/.test(params.get("selection") ?? "")
    )
      throw new FlowError("invalid", "PDF selection is invalid.");
    const book = await this.ensureBook(snapshot);
    const fingerprint = await digest([
      book.id,
      snapshot.page,
      params.get("selection"),
      snapshot.text.replace(/\r\n?/g, "\n").trim(),
    ]);
    return this.locked(`excerpt:${fingerprint}`, async () => {
      const existing = this.index
        .excerpts()
        .find((e) => e.fingerprint === fingerprint);
      if (existing)
        return {
          status: "unchanged",
          id: existing.id,
          path: existing.path,
          warnings: [],
        };
      const now = new Date().toISOString(),
        id = crypto.randomUUID();
      const excerpt: Excerpt = {
        id,
        kind: "excerpt",
        path: `${this.settings().excerptFolder}/${safeName(snapshot.title)}-p${snapshot.page}-${id.slice(0, 8)}.md`,
        revision: "",
        bookId: book.id,
        pdfPath: book.pdfPath,
        bookPath: book.path,
        page: snapshot.page,
        subpath: snapshot.subpath,
        quote: snapshot.text.trim(),
        reflection: "",
        state: "inbox",
        fingerprint,
        createdAt: now,
        updatedAt: now,
      };
      const result = await this.save(excerpt);
      try {
        await this.refreshShelf();
      } catch {
        result.warnings.push(
          "Excerpt saved; shelf refresh failed. Retry from the workbench.",
        );
      }
      return result;
    });
  }
  async saveReflection(
    id: string,
    reflection: string,
    expected: string,
    archived = false,
  ): Promise<SaveResult> {
    return this.locked(id, async () => {
      const current = await this.read(id);
      if (current.kind !== "excerpt")
        throw new FlowError("invalid", "Not an excerpt.");
      const value = reflection.replace(/\r\n?/g, "\n").trim();
      if (
        current.reflection === value &&
        current.state ===
          (archived ? "archived" : hasText(value) ? "understood" : "inbox")
      )
        return { status: "unchanged", id, path: current.path, warnings: [] };
      return this.save(
        {
          ...current,
          reflection: value,
          state: archived
            ? "archived"
            : hasText(value)
              ? "understood"
              : "inbox",
          updatedAt: new Date().toISOString(),
        },
        expected,
      );
    });
  }
  newCard(excerpt?: Excerpt): Card {
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const book = excerpt ? this.index.get(excerpt.bookId) : undefined;
    return {
      id,
      kind: "card",
      path: `${this.settings().cardFolder}/${now.slice(0, 10)}-记忆卡片-${id.slice(0, 8)}.md`,
      revision: "",
      excerptId: excerpt?.id ?? "",
      bookId: excerpt?.bookId ?? "",
      cardType: excerpt ? "pdf" : "text",
      status: "draft",
      question: "",
      answer: excerpt?.reflection ?? "",
      deckTag: this.settings().defaultDeck,
      source:
        book?.kind === "book" && excerpt ? book.pdfPath + excerpt.subpath : "",
      excerptPath: excerpt?.path ?? "",
      separator: "?",
      schedule: "",
      createdAt: now,
      updatedAt: now,
    };
  }
  async saveCard(card: Card, expected?: string): Promise<SaveResult> {
    if (
      card.status === "active" &&
      (!hasText(card.question) || !hasText(card.answer))
    )
      throw new FlowError(
        "invalid",
        "Question and answer are required before publishing.",
      );
    if (
      !/^[^\s#|\[\]:]+$/.test(card.deckTag) ||
      !card.separator.trim() ||
      /[\r\n]/.test(card.separator)
    )
      throw new FlowError("invalid", "Invalid deck or card separator.");
    return this.locked(card.id, () =>
      this.save(
        {
          ...card,
          question: card.question.trim(),
          answer: card.answer.trim(),
          updatedAt: new Date().toISOString(),
        },
        expected,
      ),
    );
  }
  async saveProgress(
    snapshot: ProgressSnapshot,
    create = false,
  ): Promise<SaveResult | null> {
    let book = this.index.books().find((b) => b.pdfPath === snapshot.pdfPath);
    if (!book && create) book = await this.ensureBook(snapshot);
    if (!book || !Number.isInteger(snapshot.page) || snapshot.page < 1)
      return null;
    const result = await this.patch(book.id, (current) =>
      current.kind === "book" && current.pdfPath === snapshot.pdfPath
        ? {
            ...current,
            page: snapshot.page,
            totalPages: snapshot.totalPages || current.totalPages,
            lastReadAt: new Date().toISOString(),
          }
        : current,
    );
    try {
      await this.refreshShelf();
    } catch {
      result.warnings.push("Progress saved; shelf refresh failed.");
    }
    return result;
  }
  async setBookStatus(id: string, status: Book["status"]): Promise<void> {
    await this.patch(id, (book) =>
      book.kind === "book" ? { ...book, status } : book,
    );
    await this.refreshShelf();
  }
  async refreshShelf(): Promise<void> {
    await this.locked("shelf", async () => {
      const path = this.settings().shelfPath;
      const start = "<!-- study-flow:shelf:start -->",
        end = "<!-- study-flow:shelf:end -->";
      const entries = this.index
        .books()
        .map(
          (book) =>
            `- [[${book.pdfPath}#page=${book.page}|${book.title}]] · ${book.page}${book.totalPages ? ` / ${book.totalPages}` : ""} · [[${book.path}|学习笔记 / Study note]]`,
        );
      const generated = `${start}\n## Study Flow\n\n${entries.join("\n") || "打开 Study Flow 开始学习 / Open Study Flow to start learning."}\n${end}`;
      if (!this.vault.exists(path))
        await this.vault.create(
          path,
          `# PDF 书架 / PDF library\n\n${generated}\n`,
        );
      else
        await this.vault.process(path, (text) => {
          const left = text.indexOf(start),
            right = text.indexOf(end);
          return left >= 0 && right >= left
            ? text.slice(0, left) + generated + text.slice(right + end.length)
            : `${text.trimEnd()}\n\n${generated}\n`;
        });
    });
  }
  async renamePdf(oldPath: string, newPath: string): Promise<void> {
    validPath(newPath);
    for (const book of this.index
      .books()
      .filter((b) => b.pdfPath === oldPath || b.pdfPath === newPath)) {
      await this.patch(book.id, (current) =>
        current.kind === "book" ? { ...current, pdfPath: newPath } : current,
      );
      await this.repairBookLinks((await this.read(book.id)) as Book);
    }
    await this.refreshShelf();
  }
  async repairBookLinks(book: Book): Promise<void> {
    for (const e of this.index
      .excerpts()
      .filter(
        (e) =>
          e.bookId === book.id &&
          (e.pdfPath !== book.pdfPath || e.bookPath !== book.path),
      ))
      await this.patch(e.id, (r) =>
        r.kind === "excerpt"
          ? { ...r, pdfPath: book.pdfPath, bookPath: book.path }
          : r,
      );
    for (const c of this.index
      .cards()
      .filter(
        (c) =>
          c.bookId === book.id &&
          c.source &&
          c.source.split("#")[0] !== book.pdfPath,
      ))
      await this.patch(c.id, (r) =>
        r.kind === "card"
          ? {
              ...r,
              source:
                book.pdfPath +
                (r.source.includes("#")
                  ? r.source.slice(r.source.indexOf("#"))
                  : "#page=1"),
            }
          : r,
      );
  }
  async relinkBook(id: string, pdfPath: string): Promise<SaveResult> {
    validPath(pdfPath);
    if (!pdfPath.toLowerCase().endsWith(".pdf") || !this.vault.exists(pdfPath))
      throw new FlowError("missing", "Choose a PDF in your vault.");
    const result = await this.patch(id, (r) =>
      r.kind === "book" ? { ...r, pdfPath } : r,
    );
    try {
      await this.repairBookLinks((await this.read(id)) as Book);
      await this.refreshShelf();
    } catch {
      result.warnings.push(
        "Book saved; refresh the library to repair remaining links.",
      );
    }
    return result;
  }
  async renameLearningFile(oldPath: string, newPath: string): Promise<void> {
    this.index.remove(oldPath);
    await this.index.refresh(newPath);
    for (const record of [...this.index.excerpts(), ...this.index.cards()]) {
      if (record.kind === "excerpt" && record.bookPath === oldPath)
        await this.patch(record.id, (r) =>
          r.kind === "excerpt" ? { ...r, bookPath: newPath } : r,
        );
      if (record.kind === "card" && record.excerptPath === oldPath)
        await this.patch(record.id, (r) =>
          r.kind === "card" ? { ...r, excerptPath: newPath } : r,
        );
    }
    await this.refreshShelf();
  }
}
