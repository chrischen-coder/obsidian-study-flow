export type Language = 'auto' | 'zh' | 'en';
export class I18n {
  constructor(public language: Language = 'auto', private locale = navigator.language) {}
  get chinese(): boolean { return this.language === 'zh' || (this.language === 'auto' && this.locale.startsWith('zh')); }
  text(zh: string, en: string): string { return this.chinese ? zh : en; }
}
