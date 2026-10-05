import type { VaultPort, SaveResult } from "./model";
export class AttachmentSession {
  private written = false;
  private referenced = false;
  constructor(
    private vault: VaultPort,
    readonly path: string,
    private bytes: ArrayBuffer,
  ) {}
  async save(action: () => Promise<SaveResult>): Promise<SaveResult> {
    if (!this.written) {
      await this.vault.createBinary(this.path, this.bytes);
      this.written = true;
    }
    try {
      const result = await action();
      this.referenced = true;
      return result;
    } catch (e) {
      if (!this.referenced) {
        await this.vault.remove(this.path);
        this.written = false;
      }
      throw e;
    }
  }
  async cancel(): Promise<void> {
    if (this.written && !this.referenced) {
      await this.vault.remove(this.path);
      this.written = false;
    }
  }
}
