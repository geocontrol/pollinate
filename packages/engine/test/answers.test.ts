import { describe, expect, it } from "vitest";
import { validateAnswerValue, validateResponse, type Question } from "../src/index";
import { employeeSurvey } from "./fixtures";

const question = (id: string): Question =>
  employeeSurvey.pages.flatMap((p) => p.questions).find((q) => q.id === id)!;

const code = (q: string, v: unknown) => validateAnswerValue(question(q), v as never)?.code ?? null;

describe("validateAnswerValue", () => {
  it("single_choice", () => {
    expect(code("q_role", "ic")).toBeNull();
    expect(code("q_role", "ceo")).toBe("unknown_option");
    expect(code("q_role", ["ic"])).toBe("invalid_type");
  });

  it("multiple_choice", () => {
    expect(code("q_lead_challenges", ["hiring"])).toBeNull();
    expect(code("q_lead_challenges", ["hiring", "nope"])).toBe("unknown_option");
    expect(code("q_lead_challenges", ["hiring", "hiring"])).toBe("duplicate_selection");
    expect(code("q_lead_challenges", ["hiring", "retention", "other"])).toBe("too_many_selections");
    expect(code("q_lead_challenges", "hiring")).toBe("invalid_type");
  });

  it("text", () => {
    expect(code("q_why", "Because")).toBeNull();
    expect(code("q_why", "x".repeat(501))).toBe("too_long");
    expect(code("q_why", 5)).toBe("invalid_type");
  });

  it("rating", () => {
    expect(code("q_satisfaction", 5)).toBeNull();
    expect(code("q_satisfaction", 6)).toBe("out_of_range");
    expect(code("q_satisfaction", 2.5)).toBe("not_integer");
    expect(code("q_satisfaction", "5")).toBe("invalid_type");
  });

  it("number", () => {
    expect(code("q_team_size", 0)).toBeNull();
    expect(code("q_team_size", -1)).toBe("out_of_range");
    expect(code("q_team_size", 1.5)).toBe("not_integer");
  });
});

describe("validateResponse", () => {
  it("requires visible required questions on the page being submitted", () => {
    const result = validateResponse(employeeSurvey, { q_role: "manager" }, { scope: "page", pageId: "intro" });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ questionId: "q_team_size", code: "required" })]);
  });

  it("does not require questions hidden by branching", () => {
    const result = validateResponse(employeeSurvey, { q_role: "ic" }, { scope: "page", pageId: "intro" });
    expect(result.valid).toBe(true);
  });

  it("rejects submitting a page that is not on the path", () => {
    const result = validateResponse(employeeSurvey, { q_role: "ic" }, { scope: "page", pageId: "leadership" });
    expect(result.issues.map((i) => i.code)).toEqual(["page_not_on_path"]);
  });

  it("checks every page on the path for a complete submission", () => {
    const incomplete = validateResponse(employeeSurvey, { q_role: "ic", q_satisfaction: 1 }, { scope: "complete" });
    expect(incomplete.issues.map((i) => i.questionId)).toEqual(["q_improve"]);

    const complete = validateResponse(
      employeeSurvey,
      { q_role: "ic", q_satisfaction: 1, q_improve: "Flexible hours" },
      { scope: "complete" },
    );
    expect(complete.valid).toBe(true);
  });

  it("accepts a contractor ending early", () => {
    expect(validateResponse(employeeSurvey, { q_role: "contractor" }, { scope: "complete" }).valid).toBe(true);
  });

  it("flags unknown questions and bad values anywhere in the answers", () => {
    const result = validateResponse(
      employeeSurvey,
      { q_role: "ic", q_satisfaction: 4, q_bogus: "x", q_why: 42 },
      { scope: "complete" },
    );
    expect(result.issues.map((i) => [i.questionId, i.code])).toEqual([
      ["q_bogus", "unknown_question"],
      ["q_why", "invalid_type"],
    ]);
  });
});
