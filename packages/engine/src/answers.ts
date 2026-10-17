import { isAnswered } from "./conditions";
import { computePath, type SurveyPath } from "./path";
import type { AnswerValue, Answers, Question, SurveyDefinition } from "./schema";

export type AnswerIssueCode =
  | "unknown_question"
  | "invalid_type"
  | "unknown_option"
  | "duplicate_selection"
  | "too_few_selections"
  | "too_many_selections"
  | "too_long"
  | "out_of_range"
  | "not_integer"
  | "required"
  | "page_not_on_path";

export interface AnswerIssue {
  questionId: string;
  code: AnswerIssueCode;
  message: string;
}

/**
 * Checks a single, non-empty answer value against its question. Empty values
 * (undefined, "", []) are "unanswered" and are handled by required checks.
 */
export function validateAnswerValue(question: Question, value: AnswerValue): AnswerIssue | null {
  const issue = (code: AnswerIssueCode, message: string): AnswerIssue => ({
    questionId: question.id,
    code,
    message,
  });

  switch (question.type) {
    case "single_choice": {
      if (typeof value !== "string") return issue("invalid_type", "Expected a single option id");
      if (!question.options.some((o) => o.id === value)) {
        return issue("unknown_option", `'${value}' is not an option of this question`);
      }
      return null;
    }
    case "multiple_choice": {
      if (!Array.isArray(value)) return issue("invalid_type", "Expected a list of option ids");
      const known = new Set(question.options.map((o) => o.id));
      const unknown = value.find((v) => !known.has(v));
      if (unknown !== undefined) return issue("unknown_option", `'${unknown}' is not an option of this question`);
      if (new Set(value).size !== value.length) return issue("duplicate_selection", "An option was selected twice");
      if (question.minSelections !== undefined && value.length < question.minSelections) {
        return issue("too_few_selections", `Select at least ${question.minSelections}`);
      }
      if (question.maxSelections !== undefined && value.length > question.maxSelections) {
        return issue("too_many_selections", `Select at most ${question.maxSelections}`);
      }
      return null;
    }
    case "text": {
      if (typeof value !== "string") return issue("invalid_type", "Expected text");
      if (question.maxLength !== undefined && value.length > question.maxLength) {
        return issue("too_long", `Maximum ${question.maxLength} characters`);
      }
      return null;
    }
    case "rating": {
      if (typeof value !== "number" || !Number.isFinite(value)) return issue("invalid_type", "Expected a rating");
      if (!Number.isInteger(value)) return issue("not_integer", "Rating must be a whole number");
      if (value < question.min || value > question.max) {
        return issue("out_of_range", `Rating must be between ${question.min} and ${question.max}`);
      }
      return null;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return issue("invalid_type", "Expected a number");
      if (question.integer && !Number.isInteger(value)) return issue("not_integer", "Must be a whole number");
      if (question.min !== undefined && value < question.min) return issue("out_of_range", `Minimum is ${question.min}`);
      if (question.max !== undefined && value > question.max) return issue("out_of_range", `Maximum is ${question.max}`);
      return null;
    }
  }
}

export type ResponseScope =
  /** Validate before moving past one page. */
  | { scope: "page"; pageId: string }
  /** Validate before final submission. */
  | { scope: "complete" };

export interface ResponseValidation {
  valid: boolean;
  issues: AnswerIssue[];
  path: SurveyPath;
}

/**
 * Server-side (and client-side) check of a respondent's answers. Value checks
 * apply to every stored answer; required checks apply only to questions on the
 * respondent's path within the given scope.
 */
export function validateResponse(
  survey: SurveyDefinition,
  answers: Answers,
  scope: ResponseScope,
): ResponseValidation {
  const questions = new Map(survey.pages.flatMap((p) => p.questions).map((q) => [q.id, q]));
  const path = computePath(survey, answers);
  const issues: AnswerIssue[] = [];

  for (const [questionId, value] of Object.entries(answers)) {
    const question = questions.get(questionId);
    if (!question) {
      issues.push({ questionId, code: "unknown_question", message: `Unknown question '${questionId}'` });
      continue;
    }
    if (!isAnswered(value)) continue;
    const issue = validateAnswerValue(question, value);
    if (issue) issues.push(issue);
  }

  let pagesInScope = path.pages;
  if (scope.scope === "page") {
    const page = path.pages.find((p) => p.pageId === scope.pageId);
    if (!page) {
      issues.push({
        questionId: "",
        code: "page_not_on_path",
        message: `Page '${scope.pageId}' is not on this respondent's path`,
      });
      pagesInScope = [];
    } else {
      pagesInScope = [page];
    }
  }

  for (const page of pagesInScope) {
    for (const questionId of page.questionIds) {
      const question = questions.get(questionId)!;
      if (question.required && !isAnswered(answers[questionId])) {
        issues.push({ questionId, code: "required", message: "This question is required" });
      }
    }
  }

  return { valid: issues.length === 0, issues, path };
}
