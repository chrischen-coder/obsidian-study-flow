import {
  type Record,
  type Book,
  type Excerpt,
  type Card,
  type YamlPort,
  revision,
  FlowError,
} from "./model";
export const START = "<!-- study-flow:content:start -->";
export const END = "<!-- study-flow:content:end -->";
export const SOURCE = "<br><!-- study-flow:source -->";
const marker = (field: string, side: string) =>
  `<!-- study-flow:${field}:${side} -->`;
export function frontmatter(
  text: string,
  yaml: YamlPort,
): { data: { [key: string]: unknown }; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { data: {}, body: text };
  const raw = yaml.parse(match[1] ?? "");
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new FlowError("invalid", "Invalid Markdown frontmatter.");
  return {
    data: raw as { [key: string]: unknown },
    body: text.slice(match[0].length),
  };
}
export function field(text: string, name: string): string | null {
  const start = marker(name, "start"),
    end = marker(name, "end");
  const left = text.indexOf(start),
    right = text.indexOf(end, left + start.length);
  return left < 0 || right < 0
    ? null
    : text.slice(left + start.length, right).replace(/^\r?\n|\r?\n$/g, "");
}
function fieldBlock(name: string, value: string): string {
  return `${marker(name, "start")}\n${value}\n${marker(name, "end")}`;
}
function activeFields(
  body: string,
  separator: string,
): { question: string; answer: string } {
  const start = body.indexOf(START),
    end = body.indexOf(END);
  if (start < 0 || end < start)
    throw new FlowError("unsupported", "Managed content boundary is missing.");
  const lines = body.slice(start + START.length, end).split("\n");
  const separators = lines
    .map((line, i) => (line.trim() === separator ? i : -1))
    .filter((i) => i >= 0);
  if (separators.length !== 1)
    throw new FlowError(
      "unsupported",
      "The card separator changed. Repair the card in its Markdown file.",
    );
  const at = separators[0]!;
  let qStart = at - 1;
  while (qStart >= 0 && lines[qStart]?.trim()) qStart--;
  let aEnd = lines.findIndex((line, i) => i > at && line === SOURCE);
  if (aEnd < 0)
    aEnd = lines.findIndex(
      (line, i) => i > at && /^(?:来源|Source)[:：]|<!--SR:/.test(line),
    );
  if (aEnd < 0) aEnd = lines.length;
  return {
    question: lines
      .slice(qStart + 1, at)
      .join("\n")
      .trim(),
    answer: lines
      .slice(at + 1, aEnd)
      .join("\n")
      .trim()
      .replace(/\n<br>$/, ""),
  };
}
export function scheduleFrom(text: string): string {
  return (text.match(/<!--SR:[\s\S]*?-->/g) ?? []).join("\n");
}
const str = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
export function linkTarget(value: unknown): string {
  return (
    str(value)
      .replace(/^!?\[\[|\]\]$/g, "")
      .split("|")[0] ?? ""
  );
}
export function unwrapLink(value: unknown): string {
  return linkTarget(value).split("#")[0] ?? "";
}
export function parseRecord(
  path: string,
  text: string,
  yaml: YamlPort,
): Record | null {
  const { data: f, body } = frontmatter(text, yaml);
  const kind = f.study_flow_kind,
    id = str(f.study_flow_id);
  if (!kind && !f.study_flow_id && !f.study_flow_schema) return null;
  if (!id || f.study_flow_schema !== 1)
    throw new FlowError(
      "unsupported",
      "Unsupported or incomplete Study Flow schema. Keep the original file and repair its properties or use a compatible plugin version.",
    );
  const base = { id, path, revision: "" };
  let record: Record;
  if (kind === "book") {
    record = {
      ...base,
      kind,
      pdfPath: unwrapLink(f["PDF文件"]),
      title: str(f.study_flow_title, path.split("/").pop()),
      category: str(f["分类"]),
      page: num(f["当前页"], 1),
      totalPages: num(f["总页数"]),
      lastReadAt: str(f.study_flow_last_read_at),
      status:
        f.study_flow_state === "done"
          ? "done"
          : f.study_flow_state === "paused"
            ? "paused"
            : "reading",
    };
  } else if (kind === "excerpt") {
    const quote = field(body, "quote"),
      reflection = field(body, "reflection");
    if (quote === null || reflection === null)
      throw new FlowError(
        "unsupported",
        "Excerpt editing markers were removed. Open the Markdown file to repair them.",
      );
    record = {
      ...base,
      kind,
      bookId: str(f.study_flow_book),
      pdfPath: unwrapLink(f.study_flow_pdf),
      bookPath: unwrapLink(f.study_flow_book_path),
      page: num(f.study_flow_page, 1),
      subpath: str(f.study_flow_subpath),
      quote: decodeCardText(quote),
      reflection: decodeCardText(reflection),
      fingerprint: str(f.study_flow_fingerprint),
      state:
        f.study_flow_state === "archived"
          ? "archived"
          : hasMeaning(decodeCardText(reflection))
            ? "understood"
            : "inbox",
      createdAt: str(f.study_flow_created_at),
      updatedAt: str(f.study_flow_updated_at),
      legacySource: str(f.study_flow_legacy_source) || undefined,
    };
  } else if (kind === "card") {
    if (body.indexOf(START) < 0 || body.indexOf(END) <= body.indexOf(START))
      throw new FlowError(
        "unsupported",
        "Card content boundaries are missing. Open the original file to repair them.",
      );
    const status = f.study_flow_state === "active" ? "active" : "draft";
    const legacyFields =
      status === "active"
        ? { question: field(body, "question"), answer: field(body, "answer") }
        : null;
    const active =
      status === "active"
        ? legacyFields?.question !== null && legacyFields?.answer !== null
          ? legacyFields
          : activeFields(body, str(f.study_flow_separator, "?"))
        : null;
    const question =
      status === "draft"
        ? str(f.study_flow_draft_question)
        : (active?.question ?? null);
    const answer =
      status === "draft"
        ? str(f.study_flow_draft_answer)
        : (active?.answer ?? null);
    if (question === null || answer === null)
      throw new FlowError(
        "unsupported",
        "Card editing markers were removed. Use the original note or restore its markers.",
      );
    record = {
      ...base,
      kind,
      status,
      question:
        status === "draft"
          ? question
          : decodeCardText(question, str(f.study_flow_separator, "?")),
      answer:
        status === "draft"
          ? answer
          : decodeCardText(answer, str(f.study_flow_separator, "?")),
      deckTag: str(f.study_flow_deck),
      excerptId: str(f.study_flow_excerpt),
      bookId: str(f.study_flow_book),
      cardType:
        f.study_flow_card_type === "pdf"
          ? "pdf"
          : f.study_flow_card_type === "screenshot"
            ? "screenshot"
            : "text",
      source: linkTarget(f.study_flow_source),
      excerptPath: unwrapLink(f.study_flow_excerpt_path),
      separator: str(f.study_flow_separator, "?"),
      schedule: scheduleFrom(
        body.slice(body.indexOf(START), body.indexOf(END)),
      ),
      createdAt: str(f.study_flow_created_at),
      updatedAt: str(f.study_flow_updated_at),
    };
  } else throw new FlowError("unsupported", "Unknown Study Flow record kind.");
  record.revision = recordRevision(record);
  return record;
}
function hasMeaning(value: string): boolean {
  return value.replace(/[\s\u200B-\u200D\uFEFF]/gu, "").length > 0;
}
export function recordRevision(record: Record): string {
  const { revision: _r, path: _p, ...rest } = record;
  if ("schedule" in rest) rest.schedule = "";
  if ("updatedAt" in rest) rest.updatedAt = "";
  return revision(rest);
}
// Encoding also keeps excerpts/understanding out of folder-based SR decks.
export function cardText(text: string, separator = "?"): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "<br>";
      if (line.trim() === separator || line.trim() === separator + separator)
        return `\\${line}`;
      return line.replace(/::/g, "\\:\\:").replace(/==/g, "\\=\\=");
    })
    .join("\n");
}
export function decodeCardText(text: string, separator = "?"): string {
  return text
    .split("\n")
    .map((line) =>
      line === "<br>"
        ? ""
        : (line.startsWith("\\") &&
          [separator, separator + separator].includes(line.slice(1).trim())
            ? line.slice(1)
            : line
          ).replace(/\\([:=])/g, "$1"),
    )
    .join("\n");
}
export function serialize(
  record: Record,
  yaml: YamlPort,
  previous = "",
): string {
  const { data: f, body } = frontmatter(previous, yaml);
  Object.assign(f, {
    study_flow_schema: 1,
    study_flow_kind: record.kind,
    study_flow_id: record.id,
  });
  let managed: string;
  if (record.kind === "book") {
    Object.assign(f, {
      类型: "PDF学习",
      PDF文件: `[[${record.pdfPath}]]`,
      分类: record.category,
      当前页: record.page,
      总页数: record.totalPages,
      状态:
        record.status === "done"
          ? "已读完"
          : record.status === "paused"
            ? "暂停"
            : "阅读中",
      study_flow_state: record.status,
      study_flow_title: record.title,
      study_flow_last_read_at: record.lastReadAt,
      上次阅读: record.lastReadAt.slice(0, 10),
      续读链接: `[[${record.pdfPath}#page=${record.page}]]`,
      完成度:
        record.totalPages > 0
          ? Math.min(100, Math.round((record.page / record.totalPages) * 100))
          : 0,
    });
    managed = `# ${record.title}\n\n> [!success] 继续阅读 / Continue reading\n> [[${record.pdfPath}#page=${record.page}|第 ${record.page} 页 / Page ${record.page}]]\n> ${record.totalPages > 0 ? `${record.page} / ${record.totalPages}` : record.page}\n\n打开 Study Flow 查看摘录、理解和卡片。\nOpen Study Flow for excerpts, understanding and cards.`;
  } else if (record.kind === "excerpt") {
    Object.assign(f, {
      study_flow_book: record.bookId,
      study_flow_pdf: record.pdfPath ? `[[${record.pdfPath}]]` : "",
      study_flow_book_path: record.bookPath ? `[[${record.bookPath}]]` : "",
      study_flow_page: record.page,
      study_flow_subpath: record.subpath,
      study_flow_state: record.state,
      study_flow_fingerprint: record.fingerprint,
      study_flow_created_at: record.createdAt,
      study_flow_updated_at: record.updatedAt,
    });
    if (record.legacySource) f.study_flow_legacy_source = record.legacySource;
    managed =
      `# 摘录 / Excerpt · p.${record.page}\n\n` +
      (record.pdfPath
        ? `[[${record.pdfPath}${record.subpath}|回到原文 / Return to source]]\n\n`
        : "") +
      (record.bookPath
        ? `[[${record.bookPath}|学习笔记 / Study note]]\n\n`
        : "") +
      `## 原文 / Source\n\n${fieldBlock("quote", cardText(record.quote))}\n\n## 我的理解 / My understanding\n\n${fieldBlock("reflection", cardText(record.reflection))}`;
  } else {
    Object.assign(f, {
      类型:
        record.cardType === "pdf"
          ? "PDF记忆卡片"
          : record.cardType === "screenshot"
            ? "截图错题卡"
            : "文字错题卡",
      study_flow_state: record.status,
      study_flow_excerpt: record.excerptId,
      study_flow_book: record.bookId,
      study_flow_card_type: record.cardType,
      study_flow_deck: record.deckTag,
      study_flow_source: record.source ? `[[${record.source}]]` : "",
      study_flow_excerpt_path: record.excerptPath
        ? `[[${record.excerptPath}]]`
        : "",
      study_flow_separator: record.separator,
      study_flow_created_at: record.createdAt,
      study_flow_updated_at: record.updatedAt,
    });
    if (record.status === "draft") {
      f.study_flow_draft_question = record.question;
      f.study_flow_draft_answer = record.answer;
      managed =
        "# 卡片草稿 / Card draft\n\n在 Study Flow 编辑并预览，确认后发布。\nEdit and preview in Study Flow before publishing.";
    } else {
      delete f.study_flow_draft_question;
      delete f.study_flow_draft_answer;
      // SR rewrites the complete question when rating. Keep only the outer boundary
      // and a source delimiter embedded in card text, which its parser preserves.
      managed =
        `# 记忆卡片 / Memory card\n\n#${record.deckTag}\n\n${cardText(record.question, record.separator)}\n${record.separator}\n${cardText(record.answer, record.separator)}\n${SOURCE}` +
        (record.source
          ? `\n来源 / Source: [[${record.source}|回到原文 / Return to source]]`
          : "") +
        (record.excerptPath
          ? `\n<br>\n[[${record.excerptPath}|摘录与理解 / Excerpt and understanding]]`
          : "") +
        (record.schedule ? `\n${record.schedule}` : "");
    }
  }
  const block = `${START}\n${managed}\n\n${END}`;
  let updated: string;
  const left = body.indexOf(START),
    right = body.indexOf(END);
  if (left >= 0 && right >= left)
    updated = body.slice(0, left) + block + body.slice(right + END.length);
  else if (previous && record.kind !== "book")
    throw new FlowError("unsupported", "Managed content boundary is missing.");
  else if (
    previous &&
    record.kind === "book" &&
    /^> \[!success\] 继续阅读[^\n]*(?:\n>[^\n]*)*/m.test(body)
  ) {
    const progress = `${START}\n${managed.replace(/^# [^\n]*\n\n/, "")}\n\n${END}`;
    updated = body.replace(
      /^> \[!success\] 继续阅读[^\n]*(?:\n>[^\n]*)*/m,
      progress,
    );
  } else updated = previous ? `${body.trimEnd()}\n\n${block}\n` : `${block}\n`;
  return `---\n${yaml.stringify(f).trimEnd()}\n---\n\n${updated.trimStart()}`;
}
