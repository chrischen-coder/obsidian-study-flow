import type { App } from "obsidian";
export function dependency(app: App, id: string): unknown {
  const registry = (
    app as unknown as {
      plugins?: {
        getPlugin?: (id: string) => unknown;
        plugins?: { [id: string]: unknown };
      };
    }
  ).plugins;
  return registry?.getPlugin?.(id) ?? registry?.plugins?.[id];
}
export function executeCommand(app: App, id: string): boolean {
  const commands = (
    app as unknown as {
      commands?: { executeCommandById?: (id: string) => boolean };
    }
  ).commands;
  return commands?.executeCommandById?.(id) ?? false;
}
export function versionOf(plugin: unknown): string {
  return (
    (plugin as { manifest?: { version?: string } } | undefined)?.manifest
      ?.version ?? ""
  );
}
