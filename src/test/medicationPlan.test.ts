import {
  cleanTimes,
  localTime,
  matchesAllowedName,
  normalizeTime,
  planItemErrors,
  reminderSms,
  sanitizePlan,
  smsPhone,
  spreadTimes,
} from "../../supabase/functions/_shared/medication-plan.ts";

describe("times", () => {
  it.each([
    ["8", "08:00"], ["8:5", "08:05"], ["08.30", "08:30"], [" 21:00 ", "21:00"], ["23:59", "23:59"],
  ])("normalizes %s", (input, out) => {
    expect(normalizeTime(input)).toBe(out);
  });

  it.each(["24:00", "12:60", "abc", "", "7pm"])("rejects %s", (input) => {
    expect(normalizeTime(input)).toBeNull();
  });

  it("sorts, dedupes and drops invalid times", () => {
    expect(cleanTimes(["20:00", "8:00", "08:00", "nope", "13:30"])).toEqual(["08:00", "13:30", "20:00"]);
  });

  it("spreads doses over waking hours", () => {
    expect(spreadTimes(3, "07:00", "23:00")).toEqual(["07:00", "15:00", "23:00"]);
    expect(spreadTimes(1, "07:00", "23:00")).toEqual(["07:00"]);
    expect(spreadTimes(2, "08:00", "20:00")).toEqual(["08:00", "20:00"]);
  });

  it("shows Tashkent local time", () => {
    expect(localTime("2030-01-01T03:00:00Z", "Asia/Tashkent")).toBe("08:00");
  });
});

describe("sanitizePlan", () => {
  const raw = {
    items: [
      { medicine_name: "Amoksitsillin 500", dose: "1000 mg", instructions: "ovqatdan keyin", times: ["20:00", "8:00", "14:00"], days: 7, needs_confirmation: false, note: "" },
      { medicine_name: "Aspirin", dose: "100 mg", instructions: "", times: ["09:00"], days: 30, needs_confirmation: false, note: "" },
      { medicine_name: "Ibuprofen", dose: "200 mg", instructions: "og'riqda", times: [], days: 0, needs_confirmation: true, note: "faqat og'riqda" },
      { medicine_name: "Vitamin D", dose: "1 tab", instructions: "", times: ["9"], days: 200, needs_confirmation: false, note: "" },
    ],
    warnings: ["Shifokor bilan tekshiring"],
  };

  it("keeps only prescribed medicines and the doctor's dose", () => {
    const { items, warnings } = sanitizePlan(raw, {
      allowedNames: ["Amoksitsillin", "Ibuprofen", "Vitamin D"],
      prescribedDoses: { Amoksitsillin: "500 mg", Ibuprofen: "200 mg", "Vitamin D": "1 tabletka" },
    });
    expect(items.map((i) => i.medicine_name)).toEqual(["Amoksitsillin", "Ibuprofen", "Vitamin D"]);
    expect(items[0].dose).toBe("500 mg"); // model said 1000 mg — the prescription wins
    expect(items[0].times).toEqual(["08:00", "14:00", "20:00"]);
    expect(warnings.some((w) => w.includes("Aspirin"))).toBe(true);
  });

  it("flags unclear items instead of guessing", () => {
    const { items } = sanitizePlan(raw, { allowedNames: ["Ibuprofen", "Vitamin D"] });
    const ibu = items.find((i) => i.medicine_name === "Ibuprofen")!;
    expect(ibu.times).toEqual([]);
    expect(ibu.days).toBe(7);
    expect(ibu.needs_confirmation).toBe(true);
    const vit = items.find((i) => i.medicine_name === "Vitamin D")!;
    expect(vit.days).toBe(90);
    expect(vit.needs_confirmation).toBe(true);
    expect(vit.times).toEqual(["09:00"]);
  });

  it("accepts any medicine for an uploaded PDF, and survives garbage", () => {
    expect(sanitizePlan(raw).items).toHaveLength(4);
    expect(sanitizePlan(null).items).toEqual([]);
    expect(sanitizePlan({ items: "x" }).items).toEqual([]);
  });

  it("matches brand names loosely", () => {
    expect(matchesAllowedName("Amoxiclav 625 mg", ["Amoxiclav"])).toBe("Amoxiclav");
    expect(matchesAllowedName("Parasetamol", ["Ibuprofen"])).toBeNull();
  });
});

describe("validation and texts", () => {
  it("reports what blocks saving", () => {
    expect(planItemErrors({ medicine_name: "A", times: ["08:00"], days: 5 })).toEqual([]);
    expect(planItemErrors({ medicine_name: "", times: [], days: 0 })).toHaveLength(3);
  });

  it("formats Uzbek phone numbers for Eskiz", () => {
    expect(smsPhone("+998 (90) 123-45-67")).toBe("998901234567");
    expect(smsPhone("901234567")).toBe("998901234567");
    expect(smsPhone("12345")).toBeNull();
    expect(smsPhone(null)).toBeNull();
  });

  it("makes a short ASCII SMS", () => {
    const sms = reminderSms({ medicine_name: "Amoksitsillin", dose: "500 mg", time: "08:00" });
    expect(sms).toBe("MaxHospital: soat 08:00 - Amoksitsillin 500 mg ichish vaqti.");
    expect(/^[\x20-\x7E]+$/.test(reminderSms({ medicine_name: "Ко‘рвалол", time: "09:00" }))).toBe(true);
  });
});
