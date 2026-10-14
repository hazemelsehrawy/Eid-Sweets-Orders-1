/**
 * Hijri Calendar & Eid Milestones Utilities
 * Uses native Intl.DateTimeFormat with islamic-umalqura calendar.
 * Supports moon sighting offset adjustment (-1, 0, +1 days).
 */

import { useState, useEffect } from "react";

export interface HijriDateInfo {
  dayNum: number;
  monthNum: number;
  yearNum: number;
  dayValAr: string;
  monthValAr: string;
  yearValAr: string;
  monthValEn: string;
  formattedAr: string;
  formattedFullAr: string;
  formattedEn: string;
  formattedFullEn: string;
}

export interface EidMilestone {
  id: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  isoDate: string;
  dayNameAr: string;
  dayNameEn: string;
  gregorianFormattedAr: string;
  gregorianFormattedEn: string;
  hijriFormattedAr: string;
  hijriFormattedEn: string;
  isEve?: boolean;
}

const HIJRI_OFFSET_STORAGE_KEY = "eid_sweets_hijri_sighting_offset";

export function getStoredSightingOffset(): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  const raw = window.localStorage.getItem(HIJRI_OFFSET_STORAGE_KEY);
  if (!raw) return 0;
  const num = parseInt(raw, 10);
  return isNaN(num) ? 0 : Math.max(-2, Math.min(2, num));
}

export function setStoredSightingOffset(offset: number): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const safe = Math.max(-2, Math.min(2, offset));
  window.localStorage.setItem(HIJRI_OFFSET_STORAGE_KEY, String(safe));
  window.dispatchEvent(new Event("hijri-offset-changed"));
}

export function useHijriOffset(): [number, (newOffset: number) => void] {
  const [offset, setOffset] = useState<number>(() => getStoredSightingOffset());

  useEffect(() => {
    const handleUpdate = () => {
      setOffset(getStoredSightingOffset());
    };
    window.addEventListener("storage", handleUpdate);
    window.addEventListener("hijri-offset-changed", handleUpdate);
    return () => {
      window.removeEventListener("storage", handleUpdate);
      window.removeEventListener("hijri-offset-changed", handleUpdate);
    };
  }, []);

  const updateOffset = (newOffset: number) => {
    setStoredSightingOffset(newOffset);
    setOffset(newOffset);
  };

  return [offset, updateOffset];
}

export function parseDateInput(dateInput: Date | string): Date {
  if (dateInput instanceof Date) return new Date(dateInput);
  if (typeof dateInput === "string") {
    const parts = dateInput.slice(0, 10).split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d, 12, 0, 0);
    }
  }
  return new Date();
}

export function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getHijriDateInfo(
  dateInput: Date | string,
  sightingOffset: number = getStoredSightingOffset(),
): HijriDateInfo {
  try {
    const target = parseDateInput(dateInput);
    if (sightingOffset !== 0) {
      target.setDate(target.getDate() + sightingOffset);
    }

    const arParts = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).formatToParts(target);

    const enParts = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).formatToParts(target);

    const dayValAr = arParts.find((p) => p.type === "day")?.value || "";
    const monthValAr = arParts.find((p) => p.type === "month")?.value || "";
    const yearValAr = arParts.find((p) => p.type === "year")?.value || "";

    const dayNum = parseInt(enParts.find((p) => p.type === "day")?.value || "1", 10);
    const monthNum = parseInt(enParts.find((p) => p.type === "month")?.value || "1", 10);
    const yearNum = parseInt(enParts.find((p) => p.type === "year")?.value || "1448", 10);

    const monthValEn = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
      month: "short",
    }).format(target);

    return {
      dayNum,
      monthNum,
      yearNum,
      dayValAr,
      monthValAr,
      yearValAr,
      monthValEn,
      formattedAr: `${dayValAr} ${monthValAr}`,
      formattedFullAr: `${dayValAr} ${monthValAr} ${yearValAr} هـ`,
      formattedEn: `${dayNum} ${monthValEn}`,
      formattedFullEn: `${dayNum} ${monthValEn}, ${yearNum} AH`,
    };
  } catch (err) {
    console.warn("Hijri conversion error, returning fallback:", err);
    return {
      dayNum: 1,
      monthNum: 1,
      yearNum: 1448,
      dayValAr: "١",
      monthValAr: "شوال",
      yearValAr: "١٤٤٨",
      monthValEn: "Shaw.",
      formattedAr: "١ شوال",
      formattedFullAr: "١ شوال ١٤٤٨ هـ",
      formattedEn: "1 Shaw.",
      formattedFullEn: "1 Shaw., 1448 AH",
    };
  }
}

export function formatDualDate(
  dateInput: Date | string,
  lang: "ar" | "en" = "ar",
  sightingOffset: number = getStoredSightingOffset(),
): string {
  const d = parseDateInput(dateInput);
  const hijri = getHijriDateInfo(d, sightingOffset);

  if (lang === "ar") {
    const dayNameAr = new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(d);
    const gregAr = new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    return `${dayNameAr} ${gregAr} م (${hijri.formattedFullAr})`;
  }

  const dayNameEn = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d);
  const gregEn = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
  return `${dayNameEn}, ${gregEn} (${hijri.formattedFullEn})`;
}

/**
 * Finds upcoming Eid al-Fitr or Eid al-Adha milestones based on baseDate
 */
export function getUpcomingEidMilestones(
  baseDateInput: Date | string = new Date(),
  sightingOffset: number = getStoredSightingOffset(),
): EidMilestone[] {
  const start = parseDateInput(baseDateInput);
  let fitr1Date: Date | null = null;
  let adha1Date: Date | null = null;

  // Scan up to 365 days forward
  for (let i = 0; i <= 365; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    const { dayNum, monthNum } = getHijriDateInfo(cur, sightingOffset);

    if (!fitr1Date && monthNum === 10 && dayNum === 1) {
      fitr1Date = new Date(cur);
    }
    if (!adha1Date && monthNum === 12 && dayNum === 10) {
      adha1Date = new Date(cur);
    }
    if (fitr1Date && adha1Date) break;
  }

  // Determine which Eid is closer
  const chooseFitr =
    fitr1Date && (!adha1Date || fitr1Date.getTime() <= adha1Date.getTime());
  const primaryEidDate = chooseFitr ? fitr1Date : adha1Date;

  if (!primaryEidDate) return [];

  const milestones: EidMilestone[] = [];
  const isFitr = chooseFitr;

  // 1. Eve (وقفة العيد)
  const eveDate = new Date(primaryEidDate);
  eveDate.setDate(primaryEidDate.getDate() - 1);
  const eveHijri = getHijriDateInfo(eveDate, sightingOffset);

  milestones.push({
    id: "eid-eve",
    titleAr: isFitr ? "وقفة عيد الفطر" : "وقفة عرفات",
    titleEn: isFitr ? "Eid Eve" : "Arafat Day",
    subtitleAr: isFitr ? "ليلة العيد (٢٩-٣٠ رمضان)" : "٩ ذو الحجة",
    subtitleEn: isFitr ? "Ramadan 29-30" : "Dhu al-Hijjah 9",
    isoDate: toIsoDate(eveDate),
    dayNameAr: new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(eveDate),
    dayNameEn: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(eveDate),
    gregorianFormattedAr: new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
    }).format(eveDate),
    gregorianFormattedEn: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
    }).format(eveDate),
    hijriFormattedAr: eveHijri.formattedAr,
    hijriFormattedEn: eveHijri.formattedEn,
    isEve: true,
  });

  // 2. Day 1 (أول أيام العيد)
  const day1Date = new Date(primaryEidDate);
  const day1Hijri = getHijriDateInfo(day1Date, sightingOffset);
  milestones.push({
    id: "eid-day-1",
    titleAr: isFitr ? "أول أيام عيد الفطر" : "أول أيام عيد الأضحى",
    titleEn: "1st Day of Eid",
    subtitleAr: isFitr ? "١ شوال (صبيحة العيد)" : "١٠ ذو الحجة",
    subtitleEn: isFitr ? "1 Shawwal" : "10 Dhu al-Hijjah",
    isoDate: toIsoDate(day1Date),
    dayNameAr: new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(day1Date),
    dayNameEn: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day1Date),
    gregorianFormattedAr: new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
    }).format(day1Date),
    gregorianFormattedEn: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
    }).format(day1Date),
    hijriFormattedAr: day1Hijri.formattedAr,
    hijriFormattedEn: day1Hijri.formattedEn,
  });

  // 3. Day 2 (ثاني أيام العيد)
  const day2Date = new Date(primaryEidDate);
  day2Date.setDate(primaryEidDate.getDate() + 1);
  const day2Hijri = getHijriDateInfo(day2Date, sightingOffset);
  milestones.push({
    id: "eid-day-2",
    titleAr: "ثاني أيام العيد",
    titleEn: "2nd Day of Eid",
    subtitleAr: isFitr ? "٢ شوال" : "١١ ذو الحجة",
    subtitleEn: isFitr ? "2 Shawwal" : "11 Dhu al-Hijjah",
    isoDate: toIsoDate(day2Date),
    dayNameAr: new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(day2Date),
    dayNameEn: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day2Date),
    gregorianFormattedAr: new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
    }).format(day2Date),
    gregorianFormattedEn: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
    }).format(day2Date),
    hijriFormattedAr: day2Hijri.formattedAr,
    hijriFormattedEn: day2Hijri.formattedEn,
  });

  // 4. Day 3 (ثالث أيام العيد)
  const day3Date = new Date(primaryEidDate);
  day3Date.setDate(primaryEidDate.getDate() + 2);
  const day3Hijri = getHijriDateInfo(day3Date, sightingOffset);
  milestones.push({
    id: "eid-day-3",
    titleAr: "ثالث أيام العيد",
    titleEn: "3rd Day of Eid",
    subtitleAr: isFitr ? "٣ شوال" : "١٢ ذو الحجة",
    subtitleEn: isFitr ? "3 Shawwal" : "12 Dhu al-Hijjah",
    isoDate: toIsoDate(day3Date),
    dayNameAr: new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(day3Date),
    dayNameEn: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day3Date),
    gregorianFormattedAr: new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "short",
    }).format(day3Date),
    gregorianFormattedEn: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
    }).format(day3Date),
    hijriFormattedAr: day3Hijri.formattedAr,
    hijriFormattedEn: day3Hijri.formattedEn,
  });

  return milestones;
}
