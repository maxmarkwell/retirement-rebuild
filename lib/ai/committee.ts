import { getOpenAIClient } from "./client";
import {
  COMMITTEE_PROMPT_VERSION,
  buildChairPrompt,
  buildSpecialistPrompt,
} from "./prompts";
import type {
  CommitteeFinalDecision,
  CommitteePortfolioMode,
  CommitteeRunResult,
  SpecialistAnalysis,
} from "./committee-types";

const SPECIALIST_MODEL = "gpt-5.6-terra";
const CHAIR_MODEL = "gpt-5.6-sol";

// ---------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------

const specialistSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ticker: {
      type: "string",
    },
    researchAnalysis: {
      type: "string",
    },
    bullCase: {
      type: "string",
    },
    bearCase: {
      type: "string",
    },
    riskAnalysis: {
      type: "string",
    },
    portfolioAnalysis: {
      type: "string",
    },
  },
  required: [
    "ticker",
    "researchAnalysis",
    "bullCase",
    "bearCase",
    "riskAnalysis",
    "portfolioAnalysis",
  ],
} as const;

const finalDecisionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendation: {
      type: "string",
      enum: [
        "buy",
        "sell",
        "hold",
        "watch",
        "avoid",
        "rebalance",
      ],
    },

    confidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },

    riskLevel: {
      type: "string",
      enum: [
        "low",
        "medium",
        "high",
      ],
    },

    recommendedAllocation: {
      anyOf: [
        {
          type: "number",
          minimum: 0,
        },
        {
          type: "null",
        },
      ],
    },

    expectedHoldingPeriod: {
      anyOf: [
        {
          type: "string",
        },
        {
          type: "null",
        },
      ],
    },

    finalThesis: {
      type: "string",
    },

    reassessmentConditions: {
      anyOf: [
        {
          type: "string",
        },
        {
          type: "null",
        },
      ],
    },

    exitConditions: {
      anyOf: [
        {
          type: "string",
        },
        {
          type: "null",
        },
      ],
    },
  },

  required: [
    "recommendation",
    "confidence",
    "riskLevel",
    "recommendedAllocation",
    "expectedHoldingPeriod",
    "finalThesis",
    "reassessmentConditions",
    "exitConditions",
  ],
} as const;

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function parseJsonResponse<T>(
  outputText: string,
  label: string
): T {
  try {
    return JSON.parse(outputText) as T;
  } catch {
    throw new Error(
      `${label} returned invalid JSON.`
    );
  }
}

// ---------------------------------------------------------
// Committee
// ---------------------------------------------------------

export async function runInvestmentCommittee(input: {
  ticker: string;

  marketPrice: number | null;

  portfolioMode:
    CommitteePortfolioMode;

  portfolioName: string;

  availableCash: number;

  currentHoldingQuantity: number;

  currentHoldingMarketValue: number;

  currentHoldingCostBasis: number;
}): Promise<CommitteeRunResult> {
  const client =
    getOpenAIClient();

  const ticker =
    input.ticker
      .trim()
      .toUpperCase();

  // ---------------------------------------------------------
  // Call 1:
  // Combined specialist panel
  // ---------------------------------------------------------

  const specialistPrompt =
    buildSpecialistPrompt({
      ticker,
      marketPrice:
        input.marketPrice,
      portfolioMode:
        input.portfolioMode,
      portfolioName:
        input.portfolioName,
      availableCash:
        input.availableCash,
      currentHoldingQuantity:
        input.currentHoldingQuantity,
      currentHoldingMarketValue:
        input.currentHoldingMarketValue,
      currentHoldingCostBasis:
        input.currentHoldingCostBasis,
    });

  const specialistResponse =
    await client.responses.create({
      model: SPECIALIST_MODEL,

      input: specialistPrompt,

      text: {
        format: {
          type: "json_schema",
          name: "specialist_analysis",
          strict: true,
          schema: specialistSchema,
        },
      },
    });

  if (
    specialistResponse.status !==
    "completed"
  ) {
    throw new Error(
      `Specialist analysis did not complete successfully. Status: ${specialistResponse.status}`
    );
  }

  if (
    !specialistResponse.output_text
  ) {
    throw new Error(
      "Specialist analysis returned no output."
    );
  }

  const specialistAnalysis =
    parseJsonResponse<SpecialistAnalysis>(
      specialistResponse.output_text,
      "Specialist analysis"
    );

  // Defensive normalization
  specialistAnalysis.ticker =
    ticker;

  // ---------------------------------------------------------
  // Call 2:
  // Committee Chair
  // ---------------------------------------------------------

  const chairPrompt =
    buildChairPrompt({
      ticker,
      marketPrice:
        input.marketPrice,
      portfolioMode:
        input.portfolioMode,
      portfolioName:
        input.portfolioName,
      availableCash:
        input.availableCash,
      specialistAnalysis,
    });

  const chairResponse =
    await client.responses.create({
      model: CHAIR_MODEL,

      input: chairPrompt,

      text: {
        format: {
          type: "json_schema",
          name: "committee_final_decision",
          strict: true,
          schema:
            finalDecisionSchema,
        },
      },
    });

  if (
    chairResponse.status !==
    "completed"
  ) {
    throw new Error(
      `Committee Chair did not complete successfully. Status: ${chairResponse.status}`
    );
  }

  if (!chairResponse.output_text) {
    throw new Error(
      "Committee Chair returned no output."
    );
  }

  const finalDecision =
    parseJsonResponse<CommitteeFinalDecision>(
      chairResponse.output_text,
      "Committee Chair"
    );

  // ---------------------------------------------------------
  // Portfolio-level safety guardrail
  // ---------------------------------------------------------

  if (
    finalDecision.recommendedAllocation !=
      null &&
    finalDecision.recommendedAllocation >
      input.availableCash +
        input.currentHoldingMarketValue
  ) {
    finalDecision.recommendedAllocation =
      input.availableCash +
      input.currentHoldingMarketValue;
  }

  // ---------------------------------------------------------
  // Final result
  // ---------------------------------------------------------

  return {
    ticker,
    marketPrice:
      input.marketPrice,
    specialistAnalysis,
    finalDecision,
    specialistModel:
      SPECIALIST_MODEL,
    chairModel:
      CHAIR_MODEL,
    promptVersion:
      COMMITTEE_PROMPT_VERSION,
  };
}