const roundTo = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const asFiniteNumber = (value, field) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${field} must be a finite number`);
  }
  return number;
};

/**
 * Calculates a daily time-weighted (Modified Dietz) return in percentage points.
 * Each flow is a signed, CNY-denominated external cash flow. Flows outside the
 * half-open business-day interval [dayStart, dayEnd) are deliberately excluded.
 */
const calculateModifiedDietzReturn = ({
  openingAssetsCNY,
  closingAssetsCNY,
  flows = [],
  dayStart,
  dayEnd
}) => {
  const openingAssets = asFiniteNumber(openingAssetsCNY, 'openingAssetsCNY');
  const closingAssets = asFiniteNumber(closingAssetsCNY, 'closingAssetsCNY');
  const startMs = new Date(dayStart).getTime();
  const endMs = new Date(dayEnd).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('dayStart and dayEnd must define a positive time range');
  }

  let externalNetFlow = 0;
  let weightedFlowCNY = 0;
  const durationMs = endMs - startMs;

  for (const flow of flows) {
    const amountCNY = asFiniteNumber(flow?.amountCNY, 'flow.amountCNY');
    const occurredAtMs = new Date(flow?.occurredAt).getTime();
    if (!Number.isFinite(occurredAtMs)) {
      throw new Error('flow.occurredAt must be a valid date');
    }
    if (occurredAtMs < startMs || occurredAtMs >= endMs) continue;

    const weight = (endMs - occurredAtMs) / durationMs;
    externalNetFlow += amountCNY;
    weightedFlowCNY += amountCNY * weight;
  }

  const rawDailyProfitAmount = closingAssets - openingAssets - externalNetFlow;
  const dailyProfitAmount = roundTo(rawDailyProfitAmount);
  const roundedExternalNetFlow = roundTo(externalNetFlow);
  const roundedWeightedFlowCNY = roundTo(weightedFlowCNY);
  const denominator = openingAssets + weightedFlowCNY;
  const dailyReturn = denominator > 0
    ? roundTo((rawDailyProfitAmount / denominator) * 100, 4)
    : 0;

  return {
    dailyProfitAmount,
    dailyReturn,
    externalNetFlow: roundedExternalNetFlow,
    weightedFlowCNY: roundedWeightedFlowCNY
  };
};

module.exports = { calculateModifiedDietzReturn };
