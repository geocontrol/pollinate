import { z } from "zod";

/**
 * Survey definition format (schemaVersion 1).
 *
 * A definition is the frozen content of one survey version: ordered pages of
 * questions, plus branching logic. Structural shape is enforced here with Zod;
 * semantic rules (forward-only references, valid targets, reachability) live in
 * validate-definition.ts so they can be reported as friendly builder issues.
 */

export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "IDs may contain letters, digits, '_' and '-' (max 64 chars)");

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export const comparisonOps = [
  "equals",
  "not_equals",
  "includes",
  "excludes",
  "gt",
  "gte",
  "lt",
  "lte",
  "answered",
  "not_answered",
] as const;
export type ComparisonOp = (typeof comparisonOps)[number];

export interface Comparison {
  question: string;
  op: ComparisonOp;
  value?: string | number;
}

export type Condition =
  | Comparison
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export const comparisonSchema = z
  .object({
    question: idSchema,
    op: z.enum(comparisonOps),
    value: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    comparisonSchema,
    z.object({ all: z.array(conditionSchema) }).strict(),
    z.object({ any: z.array(conditionSchema) }).strict(),
    z.object({ not: conditionSchema }).strict(),
  ]),
);

export function isComparison(c: Condition): c is Comparison {
  return "op" in c;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const optionSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
});
export type Option = z.infer<typeof optionSchema>;

const questionBase = {
  id: idSchema,
  prompt: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  /** Question is shown only when this condition holds. Absent = always shown. */
  visibleWhen: conditionSchema.optional(),
};

export const singleChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("single_choice"),
  options: z.array(optionSchema).min(2),
  display: z.enum(["radio", "dropdown"]).default("radio"),
});

export const multipleChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("multiple_choice"),
  options: z.array(optionSchema).min(1),
  minSelections: z.number().int().min(1).optional(),
  maxSelections: z.number().int().min(1).optional(),
});

export const textQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("text"),
  multiline: z.boolean().default(false),
  maxLength: z.number().int().min(1).optional(),
});

export const ratingQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("rating"),
  min: z.number().int().default(1),
  max: z.number().int().default(5),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
});

export const numberQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("number"),
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().default(false),
});

export const questionSchema = z.discriminatedUnion("type", [
  singleChoiceQuestionSchema,
  multipleChoiceQuestionSchema,
  textQuestionSchema,
  ratingQuestionSchema,
  numberQuestionSchema,
]);
export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question["type"];

// ---------------------------------------------------------------------------
// Pages and navigation
// ---------------------------------------------------------------------------

export const navActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip_to"), target: idSchema }),
  z.object({ action: z.literal("end_survey"), message: z.string().optional() }),
]);
export type NavAction = z.infer<typeof navActionSchema>;

/**
 * Evaluated after the page is completed, in order; the first matching rule
 * wins. A rule with no `when` always matches. No match = continue to the next
 * page.
 */
export const navRuleSchema = z.object({
  when: conditionSchema.optional(),
  then: navActionSchema,
});
export type NavRule = z.infer<typeof navRuleSchema>;

export const pageSchema = z.object({
  id: idSchema,
  title: z.string().optional(),
  description: z.string().optional(),
  questions: z.array(questionSchema),
  /** Page is shown only when this condition holds. Hidden pages' rules are skipped. */
  visibleWhen: conditionSchema.optional(),
  next: z.array(navRuleSchema).default([]),
});
export type Page = z.infer<typeof pageSchema>;

export const surveyDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  description: z.string().optional(),
  pages: z.array(pageSchema).min(1),
});
export type SurveyDefinition = z.infer<typeof surveyDefinitionSchema>;
export type SurveyDefinitionInput = z.input<typeof surveyDefinitionSchema>;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * single_choice → option id, multiple_choice → option ids,
 * text → string, rating/number → number.
 */
export type AnswerValue = string | string[] | number;
export type Answers = Record<string, AnswerValue | undefined>;

export function parseSurveyDefinition(input: unknown): SurveyDefinition {
  return surveyDefinitionSchema.parse(input);
}

export function safeParseSurveyDefinition(input: unknown) {
  return surveyDefinitionSchema.safeParse(input);
}
