export type ParsedBetAmount =
  | { ok: true; value: number }
  | { ok: false; message: string };

export function parseBetAmountForSocket(raw: unknown): ParsedBetAmount {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, message: "Invalid bet amount" };
  }
  if (!Number.isInteger(n)) {
    return { ok: false, message: "Bet amount must be a whole number" };
  }
  return { ok: true, value: n };
}
