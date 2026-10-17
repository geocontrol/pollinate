import { describe, expect, it } from "vitest";
import { evaluateCondition, isAnswered, referencedQuestions } from "../src/index.js";

describe("isAnswered", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["   ", false],
    [[], false],
    [Number.NaN, false],
    ["x", true],
    [["a"], true],
    [0, true],
  ])("%j → %s", (value, expected) => {
    expect(isAnswered(value as never)).toBe(expected);
  });
});

describe("evaluateCondition", () => {
  const answers = { role: "manager", size: 7, tags: ["a", "b"], note: "hi" };

  it("compares single values", () => {
    expect(evaluateCondition({ question: "role", op: "equals", value: "manager" }, answers)).toBe(true);
    expect(evaluateCondition({ question: "role", op: "not_equals", value: "manager" }, answers)).toBe(false);
  });

  it("compares numbers", () => {
    expect(evaluateCondition({ question: "size", op: "gt", value: 6 }, answers)).toBe(true);
    expect(evaluateCondition({ question: "size", op: "gte", value: 7 }, answers)).toBe(true);
    expect(evaluateCondition({ question: "size", op: "lt", value: 7 }, answers)).toBe(false);
    expect(evaluateCondition({ question: "size", op: "lte", value: 7 }, answers)).toBe(true);
  });

  it("checks multiple-choice membership", () => {
    expect(evaluateCondition({ question: "tags", op: "includes", value: "a" }, answers)).toBe(true);
    expect(evaluateCondition({ question: "tags", op: "excludes", value: "a" }, answers)).toBe(false);
    expect(evaluateCondition({ question: "tags", op: "excludes", value: "z" }, answers)).toBe(true);
  });

  it("treats every value comparison on an unanswered question as false", () => {
    expect(evaluateCondition({ question: "missing", op: "not_equals", value: "x" }, answers)).toBe(false);
    expect(evaluateCondition({ question: "missing", op: "excludes", value: "x" }, answers)).toBe(false);
    expect(evaluateCondition({ question: "missing", op: "not_answered" }, answers)).toBe(true);
    expect(evaluateCondition({ question: "note", op: "answered" }, answers)).toBe(true);
  });

  it("combines with all / any / not", () => {
    const cond = {
      any: [
        { all: [{ question: "role", op: "equals", value: "manager" }, { question: "size", op: "gte", value: 10 }] },
        { not: { question: "tags", op: "excludes", value: "b" } },
      ],
    } as const;
    expect(evaluateCondition(cond as never, answers)).toBe(true);
    expect(evaluateCondition({ all: [] }, answers)).toBe(true);
    expect(evaluateCondition({ any: [] }, answers)).toBe(false);
  });

  it("lists referenced questions", () => {
    expect(
      referencedQuestions({
        all: [{ question: "a", op: "answered" }, { not: { question: "b", op: "answered" } }],
      }),
    ).toEqual(["a", "b"]);
  });
});
