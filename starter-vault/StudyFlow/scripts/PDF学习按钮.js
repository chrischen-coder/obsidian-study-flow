module.exports = async ({ app, quickAddApi, obsidian }) => {
  const plugin = app.plugins.plugins.quickadd;
  if (!plugin) return;
  if (plugin.pdfStudyButtonsComponent) plugin.removeChild(plugin.pdfStudyButtonsComponent);
  const component = plugin.addChild(new obsidian.Component());
  plugin.pdfStudyButtonsComponent = component;
  const { resolvePdf } = require(app.vault.adapter.getFullPath("StudyFlow/scripts/打开PDF摘录.js"));
  const panels = new Map();
  const styles = new Map();
  let disposed = false;
  let running = false;
  const css = `
    .pdf-study-buttons { padding: 10px 12px; border-bottom: 1px solid var(--background-modifier-border); flex: 0 0 auto; }
    .pdf-study-buttons-title { font-size: var(--font-ui-small); font-weight: 650; margin-bottom: 4px; }
    .pdf-study-buttons-book { color: var(--text-muted); font-size: var(--font-ui-smaller); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 9px; }
    .pdf-study-buttons-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .pdf-study-buttons-row button { min-height: 36px; height: auto; padding: 8px 10px; font-size: var(--font-ui-small); font-weight: 600; cursor: pointer; }
    .pdf-study-buttons-help { margin-top: 7px; color: var(--text-muted); font-size: var(--font-ui-smaller); line-height: 1.5; }
  `;

  function render() {
    if (disposed) return;
    const leaves = app.workspace.getLeavesOfType("file-explorer");
    const pdf = resolvePdf(app);
    for (const [leaf, panel] of panels) {
      if (!leaves.includes(leaf) || !panel.el.isConnected) {
        panel.el.remove();
        panels.delete(leaf);
      }
    }
    for (const leaf of leaves) {
      let panel = panels.get(leaf);
      if (!panel) {
        const root = leaf.view.containerEl;
        const tree = root.querySelector(".nav-files-container");
        if (!tree) continue;
        const doc = root.ownerDocument;
        if (!styles.has(doc)) {
          const style = doc.createElement("style");
          style.textContent = css;
          doc.head.appendChild(style);
          styles.set(doc, style);
        }
        const el = doc.createElement("div");
        el.className = "pdf-study-buttons";
        const title = el.createDiv({ cls: "pdf-study-buttons-title", text: "PDF 划线与背诵" });
        const book = el.createDiv({ cls: "pdf-study-buttons-book" });
        const row = el.createDiv({ cls: "pdf-study-buttons-row" });
        const save = row.createEl("button", { text: "保存划线", cls: "mod-cta", attr: { type: "button", "aria-label": "保存划线" } });
        const review = row.createEl("button", { text: "背诵摘录", attr: { type: "button", "aria-label": "背诵摘录" } });
        el.createDiv({ cls: "pdf-study-buttons-help", text: "选中文字 → 点保存划线 → 写小结后保存。" });
        tree.before(el);
        panel = { el, book, save, review };
        panels.set(leaf, panel);
        for (const [button, choice] of [[save, "摘录PDF原文"], [review, "背诵PDF摘录"]]) {
          // Keep the live PDF text selection and active document while clicking the sidebar.
          component.registerDomEvent(button, "mousedown", (event) => { event.preventDefault(); event.stopPropagation(); });
          component.registerDomEvent(button, "click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (running) return;
            running = true;
            render();
            try {
              await quickAddApi.executeChoice(choice);
            } catch (error) {
              console.error("PDF 学习按钮", error);
              new obsidian.Notice("这次操作没有完成，请稍后再点一次。已有摘录仍然保留。", 6000);
            } finally {
              running = false;
              render();
            }
          });
        }
      }
      panel.book.textContent = pdf ? `当前资料：${pdf.basename}` : "先从文件列表点开一份 PDF";
      panel.save.disabled = running;
      panel.review.disabled = running;
    }
  }

  component.register(() => {
    disposed = true;
    for (const panel of panels.values()) panel.el.remove();
    for (const style of styles.values()) style.remove();
    if (plugin.pdfStudyButtonsComponent === component) delete plugin.pdfStudyButtonsComponent;
  });
  for (const name of ["layout-change", "file-open", "active-leaf-change"]) {
    component.registerEvent(app.workspace.on(name, render));
  }
  app.workspace.onLayoutReady(render);
};
