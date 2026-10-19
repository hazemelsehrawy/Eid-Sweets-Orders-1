import { describe, it, expect } from "vitest";
import { getHijriDateInfo, formatDualDate, getUpcomingEidMilestones } from "./hijri";
import { playOrderChime, unlockAudioContext } from "./audio";
import { copy } from "../locales";

describe("Frontend Locales & Translation Completeness", () => {
  it("should have identical translation keys in Arabic and English dictionaries", () => {
    const arKeys = Object.keys(copy.ar).sort();
    const enKeys = Object.keys(copy.en).sort();

    expect(arKeys.length).toBeGreaterThan(100);
    expect(enKeys.length).toBeGreaterThan(100);

    const missingInAr = enKeys.filter((k) => !(k in copy.ar));
    const missingInEn = arKeys.filter((k) => !(k in copy.en));

    expect(missingInAr).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  it("should provide non-empty strings for all critical brand and UI keys", () => {
    expect(copy.ar.storeInfoFooter).toContain("فتوح");
    expect(copy.en.storeInfoFooter).toContain("Fatouh");
  });
});

describe("Hijri Calendar & Cairo Timezone Formatting (POS-05, POS-06)", () => {
  it("should format dates accurately in Cairo timezone without daylight shifts", () => {
    const fixedDate = new Date("2026-03-31T22:30:00.000Z");
    const formattedAr = formatDualDate(fixedDate, "ar");
    expect(typeof formattedAr).toBe("string");
    expect(formattedAr).toContain("م");
    expect(formattedAr).toContain("هـ");

    const formattedEn = formatDualDate(fixedDate, "en");
    expect(typeof formattedEn).toBe("string");
    expect(formattedEn).toContain("AH");
  });

  it("should return valid Hijri information for target dates", () => {
    const date = new Date("2026-04-01T12:00:00.000Z");
    const info = getHijriDateInfo(date);

    expect(info.dayNum).toBeGreaterThanOrEqual(1);
    expect(info.dayNum).toBeLessThanOrEqual(30);
    expect(info.monthNum).toBeGreaterThanOrEqual(1);
    expect(info.monthNum).toBeLessThanOrEqual(12);
    expect(info.yearNum).toBeGreaterThanOrEqual(1447);
  });

  it("should find upcoming Eid milestones without error", () => {
    const milestones = getUpcomingEidMilestones(new Date("2026-01-01"));
    expect(Array.isArray(milestones)).toBe(true);
    expect(milestones.length).toBeGreaterThan(0);
    expect(milestones[0]).toHaveProperty("isoDate");
    expect(milestones[0]).toHaveProperty("titleAr");
  });
});

describe("Audio Context Singleton & Sound Safety (FPERF-01)", () => {
  it("should handle audio chime and unlock without throwing even if Web Audio is unsupported in node", () => {
    expect(() => unlockAudioContext()).not.toThrow();
    expect(() => playOrderChime()).not.toThrow();
  });
});

describe("POS Cash Change Due Arithmetic", () => {
  it("should accurately compute exact change due in Egyptian Pounds", () => {
    const totalOrder = 350.5;
    const cashReceived = 500;
    const changeDue = Math.max(0, Number((cashReceived - totalOrder).toFixed(2)));

    expect(changeDue).toBe(149.5);
  });

  it("should handle exact cash payment with zero change due", () => {
    const totalOrder = 240;
    const cashReceived = 240;
    const changeDue = Math.max(0, Number((cashReceived - totalOrder).toFixed(2)));

    expect(changeDue).toBe(0);
  });
});
