export enum TradeState {
  CREATED = 'Created',
  PARTIALLY_LOCKED = 'PartiallyLocked',
  BOTH_LOCKED = 'BothLocked',
  SETTLED = 'Settled',
  REFUNDING = 'Refunding',
  REFUNDED = 'Refunded',
}

export interface Trade {
  id: string;
  tradeId: string;
  partyA: string;
  partyB: string;
  cashToken: string;
  cashAmount: string;
  assetToken: string;
  assetAmount: string;
  complianceGate: string;
  expiryLedger: number;
  state: TradeState;
  cashLocked: boolean;
  assetLocked: boolean;
  contractId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeEvent {
  id: string;
  tradeId: string;
  event: string;
  data?: Record<string, any>;
  ledgerSeq?: number;
  txHash?: string;
  createdAt: string;
}

export interface TradeInstruction {
  institution: string;
  side: 'buy' | 'sell';
  assetToken: string;
  assetAmount: string;
  cashToken: string;
  cashAmount: string;
}

export interface MatchResult {
  matched: boolean;
  message?: string;
  trade?: {
    partyA: string;
    partyB: string;
    cashToken: string;
    cashAmount: string;
    assetToken: string;
    assetAmount: string;
  };
}
