import { describe, expect, it } from "vitest";
import { computePath, InvalidDefinitionError, nextPage, parseSurveyDefinition, previousPage } from "../src/index";
import { cloneInput, employeeSurvey } from "./fixtures";

const pageIds = (answers: Record<string, unknown>) =>
  computePath(employeeSurvey, answers as never).pages.map((p) => p.pageId);

describe("computePath", () => {
  it("shows every unconditional page to a new respondent", () => {
    const path = computePath(employeeSurvey, {});
    expect(path.pages.map((p) => p.pageId)).toEqual(["intro", "general", "final"]);
    expect(path.pages[0]!.questionIds).toEqual(["q_role"]);
    expect(path.end).toEqual({ reason: "end_of_survey" });
  });

  it("routes managers through the leadership page", () => {
    const path = computePath(employeeSurvey, { q_role: "manager", q_team_size: 4, q_satisfaction: 3 });
    expect(path.pages.map((p) => p.pageId)).toEqual(["intro", "leadership", "general", "final"]);
    expect(path.pages[0]!.questionIds).toEqual(["q_role", "q_team_size"]);
  });

  it("shows a follow-up question within the same page", () => {
    const path = computePath(employeeSurvey, { q_role: "manager", q_lead_challenges: ["hiring", "other"] });
    expect(path.pages.find((p) => p.pageId === "leadership")!.questionIds).toEqual([
      "q_lead_challenges",
      "q_lead_other",
    ]);
  });

  it("ends the survey early via an end_survey rule", () => {
    const path = computePath(employeeSurvey, { q_role: "contractor" });
    expect(path.pages.map((p) => p.pageId)).toEqual(["intro"]);
    expect(path.end).toEqual({
      reason: "end_rule",
      pageId: "intro",
      message: "Thanks — this survey is for employees only.",
    });
  });

  it("skips forward when a skip_to rule matches", () => {
    expect(pageIds({ q_role: "ic", q_satisfaction: 5 })).toEqual(["intro", "general", "final"]);
  });

  it("shows a conditional page when its condition holds", () => {
    expect(pageIds({ q_role: "ic", q_satisfaction: 2 })).toEqual(["intro", "general", "low_sat", "final"]);
    expect(pageIds({ q_role: "ic", q_satisfaction: 3 })).toEqual(["intro", "general", "final"]);
  });

  it("marks answers as inapplicable when an earlier answer changes", () => {
    const answers = {
      q_role: "ic", // was "manager"
      q_team_size: 12,
      q_lead_challenges: ["other"],
      q_lead_other: "Budget",
      q_satisfaction: 4,
      q_improve: "More pay", // from when satisfaction was 1
    };
    const path = computePath(employeeSurvey, answers);
    expect(path.inapplicableQuestionIds).toEqual(["q_team_size", "q_lead_challenges", "q_lead_other", "q_improve"]);
    expect(path.effectiveAnswers).toEqual({ q_role: "ic", q_satisfaction: 4 });
  });

  it("never lets a hidden question influence branching", () => {
    const input = cloneInput();
    // A page shown when q_team_size > 10 — but q_team_size is only visible to managers.
    input.pages.splice(1, 0, {
      id: "big_team",
      visibleWhen: { question: "q_team_size", op: "gt", value: 10 },
      questions: [{ id: "q_big", type: "text", prompt: "Big team?" }],
    });
    const survey = parseSurveyDefinition(input);
    const asManager = computePath(survey, { q_role: "manager", q_team_size: 12 });
    const asIc = computePath(survey, { q_role: "ic", q_team_size: 12 });
    expect(asManager.pages.map((p) => p.pageId)).toContain("big_team");
    expect(asIc.pages.map((p) => p.pageId)).not.toContain("big_team");
  });

  it("refuses to loop on a backward skip_to", () => {
    const input = cloneInput();
    input.pages[2]!.next = [{ then: { action: "skip_to", target: "intro" } }];
    expect(() => computePath(parseSurveyDefinition(input), {})).toThrow(InvalidDefinitionError);
  });
});

describe("nextPage / previousPage", () => {
  const path = computePath(employeeSurvey, { q_role: "manager", q_satisfaction: 5 });

  it("navigates along the respondent's path", () => {
    expect(nextPage(path, "intro")?.pageId).toBe("leadership");
    expect(nextPage(path, "general")?.pageId).toBe("final");
    expect(nextPage(path, "final")).toBeNull();
    expect(previousPage(path, "final")?.pageId).toBe("general");
    expect(previousPage(path, "intro")).toBeNull();
  });

  it("returns null for a page not on the path", () => {
    expect(nextPage(path, "low_sat")).toBeNull();
  });
});
