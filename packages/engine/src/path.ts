import { evaluateCondition, isAnswered } from "./conditions";
import type { Answers, SurveyDefinition } from "./schema";

export interface PathPage {
  pageId: string;
  /** Questions on this page that are visible to this respondent, in order. */
  questionIds: string[];
}

export type PathEnd =
  | { reason: "end_of_survey" }
  | { reason: "end_rule"; pageId: string; message?: string };

export interface SurveyPath {
  /** Pages the respondent sees, in order. */
  pages: PathPage[];
  /** All question ids shown to the respondent. */
  shownQuestionIds: string[];
  /** Answers restricted to shown questions — the only answers that count. */
  effectiveAnswers: Answers;
  /**
   * Questions that have a stored answer but are no longer on the path (e.g.
   * the respondent went back and changed an earlier answer). Kept in storage,
   * excluded from analysis.
   */
  inapplicableQuestionIds: string[];
  end: PathEnd;
}

export class InvalidDefinitionError extends Error {
  override name = "InvalidDefinitionError";
}

/**
 * Walks the survey in order and returns the route this respondent takes given
 * their current answers. This is the single source of truth for branching and
 * runs identically in the browser and on the server.
 *
 * Pages after the respondent's current position are provisional: they may
 * change once later questions are answered.
 *
 * Conditions only ever see answers to questions already on the path, so an
 * answer to a hidden question can never influence branching.
 */
export function computePath(survey: SurveyDefinition, answers: Answers): SurveyPath {
  const pageIndex = new Map(survey.pages.map((p, i) => [p.id, i]));
  const pages: PathPage[] = [];
  const shown: string[] = [];
  const effective: Answers = {};
  let end: PathEnd = { reason: "end_of_survey" };

  let i = 0;
  walk: while (i < survey.pages.length) {
    const page = survey.pages[i]!;

    if (page.visibleWhen && !evaluateCondition(page.visibleWhen, effective)) {
      i++;
      continue;
    }

    const questionIds: string[] = [];
    for (const q of page.questions) {
      if (q.visibleWhen && !evaluateCondition(q.visibleWhen, effective)) continue;
      questionIds.push(q.id);
      shown.push(q.id);
      const value = answers[q.id];
      if (isAnswered(value)) effective[q.id] = value;
    }
    pages.push({ pageId: page.id, questionIds });

    for (const rule of page.next) {
      if (rule.when && !evaluateCondition(rule.when, effective)) continue;
      if (rule.then.action === "end_survey") {
        end = { reason: "end_rule", pageId: page.id, message: rule.then.message };
        break walk;
      }
      const target = pageIndex.get(rule.then.target);
      if (target === undefined || target <= i) {
        throw new InvalidDefinitionError(
          `Page '${page.id}' has a skip_to rule with invalid target '${rule.then.target}'`,
        );
      }
      i = target;
      continue walk;
    }
    i++;
  }

  const shownSet = new Set(shown);
  const inapplicableQuestionIds = survey.pages
    .flatMap((p) => p.questions)
    .filter((q) => !shownSet.has(q.id) && isAnswered(answers[q.id]))
    .map((q) => q.id);

  return { pages, shownQuestionIds: shown, effectiveAnswers: effective, inapplicableQuestionIds, end };
}

/** The page after `pageId` on the path, or null if the survey ends there. */
export function nextPage(path: SurveyPath, pageId: string): PathPage | null {
  const idx = path.pages.findIndex((p) => p.pageId === pageId);
  if (idx === -1) return null;
  return path.pages[idx + 1] ?? null;
}

/** The page before `pageId` on the path, or null if it is the first. */
export function previousPage(path: SurveyPath, pageId: string): PathPage | null {
  const idx = path.pages.findIndex((p) => p.pageId === pageId);
  if (idx <= 0) return null;
  return path.pages[idx - 1] ?? null;
}
