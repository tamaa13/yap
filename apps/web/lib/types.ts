export type FighterArchetype =
  | "roaster"
  | "debater"
  | "philosopher"
  | "troll"
  | "scholar"
  | "provocateur";

export interface Archetype {
  id: FighterArchetype;
  name: string;
  blurb: string;
  stat: string;
}

export interface Fighter {
  id: number;
  name: string;
  arch: FighterArchetype;
  elo: number;
  w: number;
  l: number;
  earnings: number;
  owner: string;
  forSale: boolean;
  forRent: boolean;
  price?: number;
  rentPrice?: number;
  color: string;
  hp: number;
  logic: number;
  wit: number;
  tags: string[];
  battles: number;
  attest: string;
  /** Real mint transaction hash from server meta — used for explorer link. */
  mintTxHash?: string;
  style?: string[];
  /** Address of the current active renter (if any). Set when RentalEscrow
   * has a non-expired rental for this token. */
  rentedBy?: string;
  /** ms epoch when the active rental expires. 0 when not rented. */
  rentExpiresAt?: number;
}

export type BattleStatus = "live" | "upcoming" | "past";

export interface Battle {
  id: string;
  status: BattleStatus;
  round: number;
  maxRound: number;
  topic: string;
  a: number;
  b: number;
  pool: number;
  spectators: number;
  endsIn: number | null;
  startedAt: number | null;
  oddsA: number;
  oddsB: number;
  winner?: "a" | "b";
  endedAt?: number;
  attest?: string;
}

export interface ArgumentLine {
  r: number;
  t: string;
  speaker: "a" | "b" | "judge";
  text: string;
}

export type BetStatus = "active" | "won" | "lost";
export interface Bet {
  id: string;
  battleId: string;
  side: "a" | "b";
  amount: number;
  odds: number;
  status: BetStatus;
  potential?: number;
  payout?: number;
  pnl?: number;
}

export type TxKind = "bet" | "payout" | "mint" | "rental" | "deposit" | "withdraw";
export interface Tx {
  id: string;
  kind: TxKind;
  desc: string;
  amount: number;
  ts: number;
}

export interface Notif {
  id: string;
  ts: number;
  text: string;
}

export interface SelfProfile {
  addr: string;
  ens: string;
  balance: number;
  locked: number;
  pending: number;
  pnl: number;
}
