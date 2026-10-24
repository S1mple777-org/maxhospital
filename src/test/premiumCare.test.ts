import { describe, expect, it } from "vitest";
import { isFutureBooking, orderQueue } from "../../supabase/functions/_shared/queue";
import { alertLevel, alertsFor, alertMessage, sanitizeHomeItems } from "../../supabase/functions/_shared/home-alerts";
import { computeWeeklyStats, fallbackReport, hasData, needsDoctor, weekPeriod } from "../../supabase/functions/_shared/weekly-report";
import { normalizeStatus, queueFirstPrice } from "../../supabase/functions/_shared/plan";

const at = (min: number) => new Date(Date.UTC(2026, 9, 17, 8, min)).toISOString();
const q = (id: string, min: number, boost = 0, first = false) => ({ id, created_at: at(min), queue_boost: boost, queue_first: first });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join("");

describe("orderQueue", () => {
  it("keeps arrival order without priority", () => {
    expect(ids(orderQueue([q("C", 3), q("A", 1), q("B", 2)]))).toBe("ABC");
  });
  it("Pro moves up 4 places, Premium 6 — not more", () => {
    const base = "ABCDEFGH".split("").map((id, i) => q(id, i));
    expect(ids(orderQueue([...base, q("P", 20, 4)]))).toBe("ABCDPEFGH");
    expect(ids(orderQueue([...base, q("R", 20, 6)]))).toBe("ABRCDEFGH");
  });
  it("boost never goes above the top", () => {
    expect(ids(orderQueue([q("A", 1), q("P", 2, 6)]))).toBe("PA");
  });
  it("first-in-queue goes to the top in arrival order", () => {
    expect(ids(orderQueue([q("A", 1), q("B", 2), q("F", 5, 4, true), q("G", 3, 0, true)]))).toBe("GFAB");
  });
  it("two boosted requests keep their own order", () => {
    const base = "ABCDE".split("").map((id, i) => q(id, i));
    expect(ids(orderQueue([...base, q("P", 10, 4), q("Q", 11, 4)]))).toBe("APBQCDE");
  });
  it("booked appointments whose time has come go first, by booked time", () => {
    const b = (id: string, min: number, slotMin: number) => ({ ...q(id, min), scheduled_at: at(slotMin) });
    expect(ids(orderQueue([q("A", 1), q("F", 2, 0, true), b("Y", 0, 40), b("X", 5, 30)]))).toBe("XYFA");
  });
  it("isFutureBooking: only bookings more than 15 minutes ahead are kept out of the live queue", () => {
    const now = Date.UTC(2026, 9, 17, 8, 0);
    expect(isFutureBooking({ scheduled_at: new Date(now + 16 * 60_000).toISOString() }, now)).toBe(true);
    expect(isFutureBooking({ scheduled_at: new Date(now + 10 * 60_000).toISOString() }, now)).toBe(false);
    expect(isFutureBooking({ scheduled_at: null }, now)).toBe(false);
  });
});

describe("home alerts", () => {
  it("levels", () => {
    expect(alertLevel("bp_systolic", 185)).toBe("danger");
    expect(alertLevel("bp_systolic", 165)).toBe("warning");
    expect(alertLevel("bp_systolic", 120)).toBeNull();
    expect(alertLevel("spo2", 88)).toBe("danger");
    expect(alertLevel("glucose", 2.5)).toBe("danger");
    expect(alertLevel("temperature", 38.7)).toBe("warning");
    expect(alertLevel("weight", 300)).toBeNull();
  });
  it("danger first, with message", () => {
    const a = alertsFor([{ metric: "pulse", value: 115 }, { metric: "spo2", value: 85 }]);
    expect(a.map((x) => x.level)).toEqual(["danger", "warning"]);
    const m = alertMessage("uz", a);
    expect(m.title).toContain("Xavfli");
    expect(m.body).toContain("103");
  });
  it("validates input", () => {
    const r = sanitizeHomeItems([{ metric: "pulse", value: "72" }, { metric: "glucose", value: "5,6" }, { metric: "pulse", value: 80 }, { metric: "spo2", value: 140 }, { metric: "x", value: 1 }]);
    expect(r.items).toEqual([{ metric: "pulse", value: 72 }, { metric: "glucose", value: 5.6 }]);
    expect(r.errors).toEqual(["spo2", "x"]);
    expect(sanitizeHomeItems("nope").errors).toEqual(["items"]);
  });
});

describe("weekly report", () => {
  const period = weekPeriod(new Date("2026-10-18T10:00:00Z"));
  it("period is 7 Tashkent days", () => {
    expect(period.start).toBe("2026-10-12");
    expect(period.end).toBe("2026-10-18");
  });
  it("computes stats and adherence", () => {
    const s = computeWeeklyStats({
      period,
      measurements: [
        { metric: "bp_systolic", value: 150, measured_at: "2026-10-14T05:00:00Z", source: "home" },
        { metric: "bp_systolic", value: 130, measured_at: "2026-10-15T05:00:00Z", source: "home" },
        { metric: "bp_systolic", value: 120, measured_at: "2026-10-05T05:00:00Z", source: "doctor" },
        { metric: "pulse", value: 70, measured_at: "2026-10-16T05:00:00Z" },
      ],
      reminders: [
        { status: "taken", scheduled_at: "2026-10-13T03:00:00Z" },
        { status: "taken", scheduled_at: "2026-10-14T03:00:00Z" },
        { status: "missed", scheduled_at: "2026-10-15T03:00:00Z" },
        { status: "skipped", scheduled_at: "2026-10-16T03:00:00Z" },
        { status: "pending", scheduled_at: "2026-10-18T15:00:00Z" },
        { status: "taken", scheduled_at: "2026-10-01T03:00:00Z" },
      ],
    });
    const bp = s.metrics.find((m) => m.metric === "bp_systolic")!;
    expect(bp).toMatchObject({ count: 2, avg: 140, min: 130, max: 150, outOfRange: 2, prevAvg: 120 });
    expect(s.meds).toEqual({ planned: 4, taken: 2, skipped: 1, missed: 1, adherence: 50 });
    expect(s.homeEntries).toBe(2);
    expect(needsDoctor(s)).toBe(true);
    expect(fallbackReport(s, "uz")).toContain("shifokor");
  });
  it("empty week", () => {
    const s = computeWeeklyStats({ period, measurements: [], reminders: [] });
    expect(hasData(s)).toBe(false);
    expect(fallbackReport(s, "en")).toContain("No measurements");
  });
});

describe("queueFirstPrice", () => {
  const status = (used: number, plan: "free" | "pro") => normalizeStatus({
    plan,
    limits: plan === "pro" ? { queue_first_monthly: 1, queue_first_price_uzs: 15000 } : { queue_first_price_uzs: null },
    usage: { queue_first_month: used },
  });
  it("free inside the monthly limit, paid after, unavailable on Free", () => {
    expect(queueFirstPrice(status(0, "pro"))).toBe(0);
    expect(queueFirstPrice(status(1, "pro"))).toBe(15000);
    expect(queueFirstPrice(status(0, "free"))).toBeNull();
  });
});
