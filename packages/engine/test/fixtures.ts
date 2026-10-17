import { parseSurveyDefinition, type SurveyDefinitionInput } from "../src/index.js";

/**
 * Employee survey exercising every branching feature:
 *  - question visibility (q_team_size, q_lead_other)
 *  - page visibility (leadership, low_sat)
 *  - end_survey rule (contractors)
 *  - skip_to rule (happy respondents skip low_sat)
 */
export const employeeSurveyInput = {
  schemaVersion: 1,
  title: "Employee experience",
  pages: [
    {
      id: "intro",
      questions: [
        {
          id: "q_role",
          type: "single_choice",
          prompt: "What is your role?",
          required: true,
          options: [
            { id: "manager", label: "Manager" },
            { id: "ic", label: "Individual contributor" },
            { id: "contractor", label: "Contractor" },
          ],
        },
        {
          id: "q_team_size",
          type: "number",
          prompt: "How many people report to you?",
          integer: true,
          min: 0,
          required: true,
          visibleWhen: { question: "q_role", op: "equals", value: "manager" },
        },
      ],
      next: [
        {
          when: { question: "q_role", op: "equals", value: "contractor" },
          then: { action: "end_survey", message: "Thanks — this survey is for employees only." },
        },
      ],
    },
    {
      id: "leadership",
      visibleWhen: { question: "q_role", op: "equals", value: "manager" },
      questions: [
        {
          id: "q_lead_challenges",
          type: "multiple_choice",
          prompt: "What are your biggest challenges?",
          maxSelections: 2,
          options: [
            { id: "hiring", label: "Hiring" },
            { id: "retention", label: "Retention" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "q_lead_other",
          type: "text",
          prompt: "Please describe",
          visibleWhen: { question: "q_lead_challenges", op: "includes", value: "other" },
        },
      ],
    },
    {
      id: "general",
      questions: [
        {
          id: "q_satisfaction",
          type: "rating",
          prompt: "How satisfied are you overall?",
          min: 1,
          max: 5,
          required: true,
        },
        { id: "q_why", type: "text", prompt: "Why?", multiline: true, maxLength: 500 },
      ],
      next: [
        {
          when: { question: "q_satisfaction", op: "gte", value: 4 },
          then: { action: "skip_to", target: "final" },
        },
      ],
    },
    {
      id: "low_sat",
      visibleWhen: { question: "q_satisfaction", op: "lte", value: 2 },
      questions: [{ id: "q_improve", type: "text", prompt: "What one thing would improve things?", required: true }],
    },
    {
      id: "final",
      questions: [{ id: "q_anything_else", type: "text", prompt: "Anything else?", multiline: true }],
    },
  ],
} satisfies SurveyDefinitionInput;

export const employeeSurvey = parseSurveyDefinition(employeeSurveyInput);

/** Deep-cloned raw input for tests that mutate the definition. */
export function cloneInput(): SurveyDefinitionInput {
  return structuredClone(employeeSurveyInput) as SurveyDefinitionInput;
}
