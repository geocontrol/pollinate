import { isComparison, type AnswerValue, type Answers, type Comparison, type Condition } from "./schema.js";

export function isAnswered(value: AnswerValue | undefined): value is AnswerValue {
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return Number.isFinite(value);
}

/**
 * Evaluates a condition against the respondent's *effective* answers (answers
 * to questions that are actually on their path).
 *
 * Any comparison other than `answered` / `not_answered` is false when the
 * referenced question is unanswered — including `not_equals` and `excludes`.
 * Survey designers combine with `not_answered` when they mean "or skipped".
 */
export function evaluateCondition(condition: Condition, answers: Answers): boolean {
  if (isComparison(condition)) return evaluateComparison(condition, answers);
  if ("all" in condition) return condition.all.every((c) => evaluateCondition(c, answers));
  if ("any" in condition) return condition.any.some((c) => evaluateCondition(c, answers));
  return !evaluateCondition(condition.not, answers);
}

function evaluateComparison({ question, op, value: expected }: Comparison, answers: Answers): boolean {
  const actual = answers[question];
  const answered = isAnswered(actual);

  if (op === "answered") return answered;
  if (op === "not_answered") return !answered;
  if (!answered) return false;

  switch (op) {
    case "equals":
      return !Array.isArray(actual) && actual === expected;
    case "not_equals":
      return !Array.isArray(actual) && actual !== expected;
    case "includes":
      return Array.isArray(actual) && typeof expected === "string" && actual.includes(expected);
    case "excludes":
      return Array.isArray(actual) && typeof expected === "string" && !actual.includes(expected);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (typeof actual !== "number" || typeof expected !== "number") return false;
      if (op === "gt") return actual > expected;
      if (op === "gte") return actual >= expected;
      if (op === "lt") return actual < expected;
      return actual <= expected;
    }
  }
}

/** Every question id a condition depends on. */
export function referencedQuestions(condition: Condition): string[] {
  if (isComparison(condition)) return [condition.question];
  if ("all" in condition) return condition.all.flatMap(referencedQuestions);
  if ("any" in condition) return condition.any.flatMap(referencedQuestions);
  return referencedQuestions(condition.not);
}

/** Every comparison inside a condition, depth-first. */
export function comparisonsIn(condition: Condition): Comparison[] {
  if (isComparison(condition)) return [condition];
  if ("all" in condition) return condition.all.flatMap(comparisonsIn);
  if ("any" in condition) return condition.any.flatMap(comparisonsIn);
  return comparisonsIn(condition.not);
}
