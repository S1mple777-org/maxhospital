import { describe, expect, it } from "vitest";
import { assessHeredity, familySummary } from "../../supabase/functions/_shared/heredity.ts";

const man = { age: 30, sex: "male" as const, bmi: 23 };
const woman = { age: 30, sex: "female" as const, bmi: 23 };
const find = (r: ReturnType<typeof assessHeredity>, id: string) => r.find((x) => x.id === id)!;

describe("heredity risk map", () => {
  it("average colorectal screening at 45 with no family history", () => {
    const r = assessHeredity([], man);
    expect(find(r, "colorectal")).toMatchObject({ level: "average", startAge: 45, now: false });
  });

  it("parent with colorectal cancer before 60 -> colonoscopy 10 years earlier", () => {
    const r = assessHeredity([{ relative: "father", disease: "colorectal", age: 45 }], man);
    expect(find(r, "colorectal")).toMatchObject({ level: "high", startAge: 35 });
    expect(r[0].level).toBe("high");
  });

  it("never below 18", () => {
    const r = assessHeredity([{ relative: "mother", disease: "colorectal", age: 20 }], man);
    expect(find(r, "colorectal").startAge).toBe(18);
  });

  it("young breast cancer in mother -> BRCA counselling", () => {
    const r = assessHeredity([{ relative: "mother", disease: "breast", age: 42 }], woman);
    expect(find(r, "breast").level).toBe("high");
    expect(find(r, "breast").action).toMatch(/BRCA/);
  });

  it("no prostate item for women, increased for men with father", () => {
    expect(assessHeredity([{ relative: "father", disease: "prostate", age: 70 }], woman).some((x) => x.id === "prostate")).toBe(false);
    expect(find(assessHeredity([{ relative: "father", disease: "prostate", age: 70 }], man), "prostate").level).toBe("increased");
  });

  it("premature heart disease: father < 55 is high, at 70 is increased", () => {
    expect(find(assessHeredity([{ relative: "father", disease: "heart", age: 50 }], man), "heart").level).toBe("high");
    expect(find(assessHeredity([{ relative: "father", disease: "heart", age: 70 }], man), "heart").level).toBe("increased");
    expect(find(assessHeredity([{ relative: "mother", disease: "heart", age: 60 }], man), "heart").level).toBe("high");
  });

  it("diabetes in parent + overweight -> test now", () => {
    const r = assessHeredity([{ relative: "mother", disease: "diabetes" }], { ...man, bmi: 28 });
    expect(find(r, "diabetes")).toMatchObject({ level: "high", startAge: 18, now: true });
    expect(find(assessHeredity([{ relative: "mother", disease: "diabetes" }], man), "diabetes").startAge).toBe(35);
  });

  it("summary text", () => {
    expect(familySummary([{ relative: "father", disease: "diabetes", age: 50 }])).toContain("Ota");
  });
});
