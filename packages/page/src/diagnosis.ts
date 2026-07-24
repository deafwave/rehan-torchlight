import type { WaterfallStep } from "./analysis";

export interface TradeoffSummary {
  totalLoss: number;
  totalGain: number;
  netDelta: number;
  primaryLoss: WaterfallStep | null;
  primaryGain: WaterfallStep | null;
}

/**
 * Reduces the fixed-order replay into an exact losses + gains = net equation.
 * Loss is returned as a positive magnitude so the UI can label it explicitly.
 */
export function summarizeTradeoff(steps: WaterfallStep[]): TradeoffSummary {
  const finite = steps.filter((step) => Number.isFinite(step.delta));
  const losses = finite
    .filter((step) => step.delta < -0.5)
    .sort((a, b) => a.delta - b.delta);
  const gains = finite
    .filter((step) => step.delta > 0.5)
    .sort((a, b) => b.delta - a.delta);

  return {
    totalLoss: -finite
      .filter((step) => step.delta < 0)
      .reduce((sum, step) => sum + step.delta, 0),
    totalGain: finite
      .filter((step) => step.delta > 0)
      .reduce((sum, step) => sum + step.delta, 0),
    netDelta: finite.reduce((sum, step) => sum + step.delta, 0),
    primaryLoss: losses[0] ?? null,
    primaryGain: gains[0] ?? null,
  };
}
