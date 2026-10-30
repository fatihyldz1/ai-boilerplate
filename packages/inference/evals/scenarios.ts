import type { EvaluationScenario } from "../src/evaluation.ts";

export const textScenarios: EvaluationScenario<string>[] = [
  {
    id: "exact-word",
    version: "1",
    input: "Reply with exactly READY and nothing else.",
    score: ({ text }) => text.trim() === "READY",
  },
  {
    id: "structured-extraction",
    version: "1",
    input:
      'Extract the project name from "Create a project called Atlas". Return only JSON with exactly one field: name.',
    score: ({ text }) => {
      try {
        const value = JSON.parse(text);
        return (
          value !== null &&
          typeof value === "object" &&
          Object.keys(value).length === 1 &&
          value.name === "Atlas"
        );
      } catch {
        return false;
      }
    },
  },
];
