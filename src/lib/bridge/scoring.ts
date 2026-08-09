/**
 * Duplicate bridge scoring, from the declaring side's point of view.
 */

import { Strain } from "./cards";
import type { Contract } from "./auction";

const TRICK_VALUE: Record<Strain, number> = {
  [Strain.Clubs]: 20,
  [Strain.Diamonds]: 20,
  [Strain.Hearts]: 30,
  [Strain.Spades]: 30,
  [Strain.NoTrump]: 30,
};

/** Contract value used to decide part score vs game, ignoring overtricks. */
export function contractTrickPoints(contract: Contract): number {
  const base = TRICK_VALUE[contract.strain] * contract.level;
  const notrumpBonus = contract.strain === Strain.NoTrump ? 10 : 0;
  const multiplier =
    contract.doubled === "doubled"
      ? 2
      : contract.doubled === "redoubled"
        ? 4
        : 1;
  return (base + notrumpBonus) * multiplier;
}

function overtrickValue(contract: Contract, vulnerable: boolean): number {
  if (contract.doubled === "doubled") return vulnerable ? 200 : 100;
  if (contract.doubled === "redoubled") return vulnerable ? 400 : 200;
  return TRICK_VALUE[contract.strain];
}

function undertrickPenalty(
  contract: Contract,
  down: number,
  vulnerable: boolean,
): number {
  if (contract.doubled === "none") return down * (vulnerable ? 100 : 50);

  // Doubled penalties: 100/200/200/300… not vulnerable, 200/300/300… vulnerable.
  let penalty = 0;
  for (let i = 1; i <= down; i += 1) {
    if (vulnerable) penalty += i === 1 ? 200 : 300;
    else if (i === 1) penalty += 100;
    else if (i <= 3) penalty += 200;
    else penalty += 300;
  }
  return contract.doubled === "redoubled" ? penalty * 2 : penalty;
}

export interface ScoreBreakdown {
  /** Total score, positive when the declaring side gained. */
  score: number;
  made: boolean;
  /** Tricks over the contract, or negative when defeated. */
  result: number;
  label: string;
}

/**
 * Scores a contract given the number of tricks the declaring side actually won.
 */
export function scoreContract(
  contract: Contract,
  tricksWon: number,
  vulnerable: boolean,
): ScoreBreakdown {
  const required = contract.level + 6;
  const result = tricksWon - required;

  if (result < 0) {
    const score = -undertrickPenalty(contract, -result, vulnerable);
    return { score, made: false, result, label: `down ${-result}` };
  }

  const trickPoints = contractTrickPoints(contract);
  const isGame = trickPoints >= 100;
  let score = trickPoints;
  score += result * overtrickValue(contract, vulnerable);
  score += isGame ? (vulnerable ? 500 : 300) : 50;
  if (contract.level === 6) score += vulnerable ? 750 : 500;
  if (contract.level === 7) score += vulnerable ? 1500 : 1000;
  if (contract.doubled === "doubled") score += 50;
  if (contract.doubled === "redoubled") score += 100;

  return {
    score,
    made: true,
    result,
    label: result === 0 ? "made exactly" : `made +${result}`,
  };
}

/**
 * Converts a raw score to IMPs. Used to size the gap between what happened and
 * what was available at the table.
 */
const IMP_TABLE = [
  20, 50, 90, 130, 170, 220, 270, 320, 370, 430, 500, 600, 750, 900, 1100, 1300,
  1500, 1750, 2000, 2250, 2500, 3000, 3500, 4000,
];

export function imps(scoreDifference: number): number {
  const absolute = Math.abs(scoreDifference);
  let value = 0;
  while (value < IMP_TABLE.length && absolute >= IMP_TABLE[value]) value += 1;
  return Math.sign(scoreDifference) * value;
}
