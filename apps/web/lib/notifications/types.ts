// Shared notification types between server SSE producer and client consumer.

export type NotifKind =
  | "challenge_incoming"
  | "challenge_accepted"
  | "challenge_declined"
  | "challenge_cancelled"
  | "verdict_submitted"
  | "battle_settled"
  | "payout_claimed";

export interface Notification {
  /** Stable id `${kind}:${battleId}:${txHash}` so reconnect replays don't dupe. */
  id: string;
  kind: NotifKind;
  battleId: number;
  message: string;
  detail?: string;
  href?: string;
  /** Unix-ms when the on-chain event landed. Used to render relative time. */
  ts: number;
}
