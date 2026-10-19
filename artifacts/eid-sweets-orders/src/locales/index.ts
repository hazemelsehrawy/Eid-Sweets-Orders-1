import en from './en.json';
import ar from './ar.json';

export const copy = { en, ar } as const;
export type Language = 'en' | 'ar';
export type CopyKey = keyof typeof copy.en;
