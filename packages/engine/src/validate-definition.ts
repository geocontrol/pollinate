import { comparisonsIn } from "./conditions";
import type { Comparison, ComparisonOp, Condition, Question, QuestionType, SurveyDefinition } from "./schema";

export type DefinitionIssueCode =
  | "no_questions"
  | "empty_page"
  | "duplicate_page_id"
  | "duplicate_question_id"
  | "duplicate_option_id"
  | "invalid_bounds"
  | "unknown_question_reference"
  | "forward_reference"
  | "self_reference"
  | "operator_not_supported"
  | "missing_value"
  | "unexpected_value"
  | "invalid_value"
  | "unknown_option_reference"
  | "unknown_skip_target"
  | "backward_skip"
  | "unreachable_rule"
  | "unreachable_page";

export interface DefinitionIssue {
  severity: "error" | "warning";
  code: DefinitionIssueCode;
  message: string;
  /** Human-readable location, e.g. "page 'intro' › question 'q_role'". */
  location: string;
}

/** Operators allowed per question type. */
const allowedOps: Record<QuestionType, readonly ComparisonOp[]> = {
  single_choice: ["equals", "not_equals", "answered", "not_answered"],
  multiple_choice: ["includes", "excludes", "answered", "not_answered"],
  text: ["equals", "not_equals", "answered", "not_answered"],
  rating: ["equals", "not_equals", "gt", "gte", "lt", "lte", "answered", "not_answered"],
  number: ["equals", "not_equals", "gt", "gte", "lt", "lte", "answered", "not_answered"],
};

interface QuestionInfo {
  question: Question;
  pageIndex: number;
  /** Position across the whole survey. */
  order: number;
}

/**
 * Semantic checks run before a survey version can be published. Errors block
 * publishing; warnings are shown in the builder but do not.
 *
 * Guarantees for a definition with no errors:
 *  - conditions only reference questions that come earlier in the survey;
 *  - skip_to rules only jump forward, so a path always terminates;
 *  - every referenced question, option and page exists.
 */
export function validateDefinition(survey: SurveyDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (severity: DefinitionIssue["severity"], code: DefinitionIssueCode, location: string, message: string) =>
    issues.push({ severity, code, location, message });

  // --- Index pages and questions, checking id uniqueness -------------------
  const pageIndex = new Map<string, number>();
  const questions = new Map<string, QuestionInfo>();
  let order = 0;

  survey.pages.forEach((page, pi) => {
    const pageLoc = `page '${page.id}'`;
    if (pageIndex.has(page.id)) add("error", "duplicate_page_id", pageLoc, `Page id '${page.id}' is used more than once`);
    else pageIndex.set(page.id, pi);

    if (page.questions.length === 0) add("warning", "empty_page", pageLoc, "Page has no questions");

    for (const q of page.questions) {
      const qLoc = `${pageLoc} › question '${q.id}'`;
      if (questions.has(q.id)) add("error", "duplicate_question_id", qLoc, `Question id '${q.id}' is used more than once`);
      else questions.set(q.id, { question: q, pageIndex: pi, order: order++ });

      if (q.type === "single_choice" || q.type === "multiple_choice") {
        const seen = new Set<string>();
        for (const o of q.options) {
          if (seen.has(o.id)) add("error", "duplicate_option_id", qLoc, `Option id '${o.id}' is used more than once`);
          seen.add(o.id);
        }
      }
      checkBounds(q, qLoc, add);
    }
  });

  if (questions.size === 0) add("error", "no_questions", "survey", "Survey has no questions");

  // --- Conditions ----------------------------------------------------------
  /**
   * `isAllowed` decides whether a referenced question is early enough to be
   * used by this condition.
   */
  const checkCondition = (
    condition: Condition,
    location: string,
    isAllowed: (ref: QuestionInfo) => boolean,
    selfId?: string,
  ) => {
    for (const cmp of comparisonsIn(condition)) {
      const ref = questions.get(cmp.question);
      if (!ref) {
        add("error", "unknown_question_reference", location, `Condition refers to unknown question '${cmp.question}'`);
        continue;
      }
      if (cmp.question === selfId) {
        add("error", "self_reference", location, "A question's visibility cannot depend on itself");
        continue;
      }
      if (!isAllowed(ref)) {
        add(
          "error",
          "forward_reference",
          location,
          `Condition refers to question '${cmp.question}', which comes later in the survey`,
        );
        continue;
      }
      checkComparison(cmp, ref.question, location, add);
    }
  };

  survey.pages.forEach((page, pi) => {
    const pageLoc = `page '${page.id}'`;

    if (page.visibleWhen) {
      checkCondition(page.visibleWhen, `${pageLoc} › visibility`, (ref) => ref.pageIndex < pi);
    }

    for (const q of page.questions) {
      if (!q.visibleWhen) continue;
      const self = questions.get(q.id);
      if (!self) continue;
      checkCondition(
        q.visibleWhen,
        `${pageLoc} › question '${q.id}' › visibility`,
        (ref) => ref.order < self.order,
        q.id,
      );
    }

    let unconditionalSeen = false;
    page.next.forEach((rule, ri) => {
      const ruleLoc = `${pageLoc} › rule ${ri + 1}`;
      if (unconditionalSeen) {
        add("warning", "unreachable_rule", ruleLoc, "An earlier rule always matches, so this rule never runs");
      }
      if (isUnconditional(rule.when)) unconditionalSeen = true;
      if (rule.when) checkCondition(rule.when, ruleLoc, (ref) => ref.pageIndex <= pi);

      if (rule.then.action === "skip_to") {
        const target = pageIndex.get(rule.then.target);
        if (target === undefined) {
          add("error", "unknown_skip_target", ruleLoc, `Skip target '${rule.then.target}' does not exist`);
        } else if (target <= pi) {
          add("error", "backward_skip", ruleLoc, `Skip target '${rule.then.target}' is not after this page`);
        }
      }
    });
  });

  // --- Reachability (static, conservative) --------------------------------
  // Only meaningful when skip targets are valid; otherwise errors already exist.
  if (!issues.some((i) => i.code === "unknown_skip_target" || i.code === "backward_skip")) {
    const reachable = survey.pages.map((_, i) => i === 0);
    survey.pages.forEach((page, pi) => {
      if (!reachable[pi]) return;
      // A conditionally visible page may be skipped entirely, so the next page
      // is reachable regardless of its rules.
      let canFallThrough = page.visibleWhen !== undefined;
      let blocked = false;
      for (const rule of page.next) {
        if (blocked) break;
        if (rule.then.action === "skip_to") reachable[pageIndex.get(rule.then.target)!] = true;
        if (isUnconditional(rule.when)) blocked = true;
      }
      if (!blocked) canFallThrough = true;
      if (canFallThrough && pi + 1 < survey.pages.length) reachable[pi + 1] = true;
    });
    survey.pages.forEach((page, pi) => {
      if (!reachable[pi]) {
        add("warning", "unreachable_page", `page '${page.id}'`, "No respondent can ever reach this page");
      }
    });
  }

  return issues;
}

export function hasBlockingIssues(issues: DefinitionIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

function isUnconditional(when: Condition | undefined): boolean {
  return when === undefined || ("all" in when && when.all.length === 0);
}

function checkBounds(
  q: Question,
  location: string,
  add: (s: DefinitionIssue["severity"], c: DefinitionIssueCode, l: string, m: string) => void,
) {
  if (q.type === "multiple_choice") {
    const { minSelections: min, maxSelections: max } = q;
    if (min !== undefined && max !== undefined && min > max) {
      add("error", "invalid_bounds", location, "minSelections is greater than maxSelections");
    }
    if (min !== undefined && min > q.options.length) {
      add("error", "invalid_bounds", location, "minSelections is greater than the number of options");
    }
  } else if (q.type === "rating") {
    if (q.min >= q.max) add("error", "invalid_bounds", location, "Rating min must be less than max");
  } else if (q.type === "number") {
    if (q.min !== undefined && q.max !== undefined && q.min > q.max) {
      add("error", "invalid_bounds", location, "min is greater than max");
    }
  }
}

function checkComparison(
  cmp: Comparison,
  question: Question,
  location: string,
  add: (s: DefinitionIssue["severity"], c: DefinitionIssueCode, l: string, m: string) => void,
) {
  if (!allowedOps[question.type].includes(cmp.op)) {
    add(
      "error",
      "operator_not_supported",
      location,
      `Operator '${cmp.op}' cannot be used with ${question.type} question '${question.id}'`,
    );
    return;
  }

  if (cmp.op === "answered" || cmp.op === "not_answered") {
    if (cmp.value !== undefined) add("error", "unexpected_value", location, `Operator '${cmp.op}' takes no value`);
    return;
  }
  if (cmp.value === undefined) {
    add("error", "missing_value", location, `Operator '${cmp.op}' needs a value`);
    return;
  }

  switch (question.type) {
    case "single_choice":
    case "multiple_choice":
      if (typeof cmp.value !== "string" || !question.options.some((o) => o.id === cmp.value)) {
        add(
          "error",
          "unknown_option_reference",
          location,
          `'${cmp.value}' is not an option of question '${question.id}'`,
        );
      }
      return;
    case "text":
      if (typeof cmp.value !== "string") add("error", "invalid_value", location, "Expected a text value");
      return;
    case "rating":
    case "number":
      if (typeof cmp.value !== "number") add("error", "invalid_value", location, "Expected a numeric value");
      return;
  }
}
