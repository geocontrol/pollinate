import { describe, expect, it } from "vitest";
import {
  hasBlockingIssues,
  parseSurveyDefinition,
  safeParseSurveyDefinition,
  validateDefinition,
  type SurveyDefinitionInput,
} from "../src/index";
import { cloneInput, employeeSurvey } from "./fixtures";

const codes = (input: SurveyDefinitionInput) =>
  validateDefinition(parseSurveyDefinition(input)).map((i) => `${i.severity}:${i.code}`);

describe("structural parsing", () => {
  it("rejects malformed definitions", () => {
    expect(safeParseSurveyDefinition({ schemaVersion: 2, title: "x", pages: [] }).success).toBe(false);
    const badQuestion = cloneInput() as any;
    badQuestion.pages[0].questions[0].type = "essay";
    expect(safeParseSurveyDefinition(badQuestion).success).toBe(false);
  });

  it("applies defaults", () => {
    const q = employeeSurvey.pages[4]!.questions[0]!;
    expect(q.required).toBe(false);
    expect(employeeSurvey.pages[1]!.next).toEqual([]);
  });
});

describe("validateDefinition", () => {
  it("accepts the sample survey with no issues", () => {
    expect(validateDefinition(employeeSurvey)).toEqual([]);
  });

  it("rejects duplicate ids", () => {
    const input = cloneInput();
    input.pages[1]!.id = "intro";
    input.pages[4]!.questions[0]!.id = "q_why";
    const q = input.pages[0]!.questions[0]!;
    if (q.type === "single_choice") q.options[1]!.id = "manager";
    expect(codes(input)).toEqual(
      expect.arrayContaining([
        "error:duplicate_page_id",
        "error:duplicate_question_id",
        "error:duplicate_option_id",
      ]),
    );
  });

  it("rejects conditions on later questions", () => {
    const input = cloneInput();
    input.pages[0]!.questions[0]!.visibleWhen = { question: "q_satisfaction", op: "gte", value: 3 };
    expect(codes(input)).toContain("error:forward_reference");
  });

  it("rejects page visibility depending on a question on the same page", () => {
    const input = cloneInput();
    input.pages[2]!.visibleWhen = { question: "q_satisfaction", op: "answered" };
    expect(codes(input)).toContain("error:forward_reference");
  });

  it("rejects a question depending on itself", () => {
    const input = cloneInput();
    input.pages[4]!.questions[0]!.visibleWhen = { question: "q_anything_else", op: "answered" };
    expect(codes(input)).toContain("error:self_reference");
  });

  it("rejects unknown questions and options in conditions", () => {
    const input = cloneInput();
    input.pages[1]!.visibleWhen = { question: "q_role", op: "equals", value: "director" };
    input.pages[3]!.visibleWhen = { question: "q_ghost", op: "answered" };
    expect(codes(input)).toEqual(["error:unknown_option_reference", "error:unknown_question_reference"]);
  });

  it("rejects operators that do not fit the question type", () => {
    const input = cloneInput();
    input.pages[1]!.visibleWhen = { question: "q_role", op: "gt", value: 2 };
    input.pages[4]!.visibleWhen = { question: "q_lead_challenges", op: "equals", value: "hiring" };
    expect(codes(input)).toEqual(["error:operator_not_supported", "error:operator_not_supported"]);
  });

  it("rejects missing, unexpected and mistyped values", () => {
    const input = cloneInput();
    input.pages[3]!.visibleWhen = {
      all: [
        { question: "q_satisfaction", op: "lte" },
        { question: "q_satisfaction", op: "answered", value: 1 },
        { question: "q_satisfaction", op: "lte", value: "2" },
      ],
    };
    expect(codes(input)).toEqual(["error:missing_value", "error:unexpected_value", "error:invalid_value"]);
  });

  it("rejects backward and unknown skip targets", () => {
    const input = cloneInput();
    input.pages[2]!.next = [{ then: { action: "skip_to", target: "intro" } }];
    input.pages[3]!.next = [{ then: { action: "skip_to", target: "nowhere" } }];
    expect(codes(input)).toEqual(["error:backward_skip", "error:unknown_skip_target"]);
  });

  it("warns about rules after an unconditional rule", () => {
    const input = cloneInput();
    input.pages[2]!.next = [
      { then: { action: "skip_to", target: "final" } },
      { when: { question: "q_satisfaction", op: "lte", value: 1 }, then: { action: "end_survey" } },
    ];
    expect(codes(input)).toContain("warning:unreachable_rule");
  });

  it("warns about pages no respondent can reach", () => {
    const input = cloneInput();
    // Everyone who sees 'general' now skips to 'final', so 'low_sat' is unreachable.
    input.pages[2]!.next = [{ then: { action: "skip_to", target: "final" } }];
    const issues = validateDefinition(parseSurveyDefinition(input));
    expect(issues).toEqual([expect.objectContaining({ code: "unreachable_page", location: "page 'low_sat'" })]);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("treats a page reached only by skip_to as reachable", () => {
    const input = cloneInput();
    input.pages.push(
      { id: "bonus", questions: [{ id: "q_bonus", type: "text", prompt: "Bonus?" }] },
    );
    input.pages[4]!.next = [{ then: { action: "end_survey" } }];
    input.pages[0]!.next!.push({
      when: { question: "q_role", op: "equals", value: "ic" },
      then: { action: "skip_to", target: "bonus" },
    });
    expect(codes(input)).toEqual([]);
  });

  it("flags invalid bounds and empty surveys", () => {
    const input = cloneInput();
    const rating = input.pages[2]!.questions[0]!;
    if (rating.type === "rating") rating.min = 5;
    const multi = input.pages[1]!.questions[0]!;
    if (multi.type === "multiple_choice") multi.minSelections = 3;
    expect(codes(input)).toEqual(["error:invalid_bounds", "error:invalid_bounds"]);

    const empty = parseSurveyDefinition({ schemaVersion: 1, title: "Empty", pages: [{ id: "p", questions: [] }] });
    expect(validateDefinition(empty).map((i) => i.code)).toEqual(["empty_page", "no_questions"]);
  });
});
