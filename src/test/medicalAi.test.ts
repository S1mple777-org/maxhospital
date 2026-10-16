import {
  analyzeTrends,
  chunkPages,
  detectEmergency,
  extractCitations,
  normalizeVector,
  rangeStatus,
  stripInvalidCitations,
} from "../../supabase/functions/_shared/medical-ai.ts";

describe("detectEmergency", () => {
  it.each([
    ["Ko'kragim qattiq og'riyapti, chap qo'limga uryapti", "chest_pain"],
    ["Ko‘kragim og‘riyapti", "chest_pain"],
    ["Отцу плохо, сильная боль в груди", "chest_pain"],
    ["Nafas ololmayapman", "breathing"],
    ["не могу дышать", "breathing"],
    ["Buvim hushini yo'qotdi", "unconscious"],
    ["Dadamning yuzi qiyshayib qoldi, gapira olmayapti", "stroke"],
    ["Bolada tutqanoq bo'ldi", "seizure"],
    ["Yashagim kelmayapti", "self_harm"],
    ["I want to kill myself", "self_harm"],
    ["Bolamning harorati 40 dan tushmayapti", "high_fever"],
    ["Homiladorman, qon ketyapti", "pregnancy_bleeding"],
  ])("flags %s", (text, rule) => {
    expect(detectEmergency(text)).toBe(rule);
  });

  it.each([
    "2 kundan beri boshim og'riyapti",
    "Qo'limni issiq suvda kuydirib oldim",
    "Harorat 37.5, burnim oqyapti",
    "У меня насморк третий день",
    "41 yoshdaman, tizzam og'riydi",
  ])("does not flag a simple case: %s", (text) => {
    expect(detectEmergency(text)).toBeNull();
  });
});

describe("analyzeTrends", () => {
  const rows = [
    { metric: "bp_systolic", value: 150, measured_at: "2026-05-01T10:00:00Z" },
    { metric: "bp_systolic", value: 138, measured_at: "2026-08-01T10:00:00Z" },
    { metric: "glucose", value: "5.0", measured_at: "2026-05-01T10:00:00Z" },
    { metric: "glucose", value: "6.4", measured_at: "2026-08-01T10:00:00Z" },
    { metric: "weight", value: 80, measured_at: "2026-05-01T10:00:00Z" },
    { metric: "weight", value: 80.5, measured_at: "2026-08-01T10:00:00Z" },
    { metric: "pulse", value: 72, measured_at: "2026-08-01T10:00:00Z" },
    { metric: "unknown_metric", value: 1, measured_at: "2026-08-01T10:00:00Z" },
  ];
  const trends = analyzeTrends(rows);
  const get = (k: string) => trends.find((t) => t.metric === k)!;

  it("ignores unknown metrics", () => {
    expect(trends.map((t) => t.metric)).toEqual(["bp_systolic", "pulse", "glucose", "weight"]);
  });

  it("detects a falling value that moves toward normal", () => {
    const bp = get("bp_systolic");
    expect(bp.latest).toBe(138);
    expect(bp.previous).toBe(150);
    expect(bp.change).toBe(-12);
    expect(bp.direction).toBe("down");
    expect(bp.status).toBe("high");
    expect(bp.improving).toBe(true);
  });

  it("detects a rising value that leaves the normal range", () => {
    const g = get("glucose");
    expect(g.direction).toBe("up");
    expect(g.status).toBe("high");
    expect(g.improving).toBe(false);
    expect(g.changePercent).toBe(28);
  });

  it("treats small changes as stable and handles metrics without a range", () => {
    const w = get("weight");
    expect(w.direction).toBe("stable");
    expect(w.status).toBe("unknown");
    expect(w.improving).toBeNull();
  });

  it("handles a single measurement", () => {
    const p = get("pulse");
    expect(p.previous).toBeNull();
    expect(p.direction).toBeNull();
    expect(rangeStatus("pulse", 72)).toBe("normal");
  });
});

describe("book helpers", () => {
  it("splits pages into overlapping chunks and keeps page numbers", () => {
    const sentence = "Kuyganda zararlangan joyni 10-20 daqiqa sovuq oqar suv ostida tuting. ";
    const pages = [sentence.repeat(40), "", sentence.repeat(5)];
    const chunks = chunkPages(pages, 600, 100);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.content.length <= 600)).toBe(true);
    expect(chunks.some((c) => c.page === 3)).toBe(true);
    expect(chunks.some((c) => c.page === 2)).toBe(false);
  });

  it("normalizes vectors to unit length", () => {
    const v = normalizeVector([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
  });

  it("keeps only citations that point to real sources", () => {
    const answer = "Sovuq suv qo'llang [1]. Muz qo'ymang [2]. Bu noto'g'ri [7].";
    expect(extractCitations(answer, 2)).toEqual([1, 2]);
    expect(stripInvalidCitations(answer, 2)).not.toContain("[7]");
  });
});
