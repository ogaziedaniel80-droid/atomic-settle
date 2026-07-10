import { Injectable } from '@angular/core';
import type { Trade, TradeInstruction, MatchResult } from '../models/trade';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = 'http://localhost:3000';

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async getTrades(): Promise<Trade[]> {
    const res = await fetch(`${this.baseUrl}/trades`);
    if (!res.ok) throw new Error(`Failed to fetch trades: ${res.status}`);
    return res.json();
  }

  async getTrade(tradeId: string): Promise<Trade> {
    const res = await fetch(`${this.baseUrl}/trades/${tradeId}`);
    if (!res.ok) throw new Error(`Failed to fetch trade: ${res.status}`);
    return res.json();
  }

  async createTrade(params: {
    partyA: string;
    partyB: string;
    cashToken: string;
    cashAmount: string;
    assetToken: string;
    assetAmount: string;
    complianceGate: string;
    expiryLedger: number;
    contractId?: string;
  }): Promise<Trade> {
    const res = await fetch(`${this.baseUrl}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to create trade: ${res.status}`);
    return res.json();
  }

  async lockCashLeg(tradeId: string, party: string): Promise<Trade> {
    const res = await fetch(`${this.baseUrl}/trades/${tradeId}/lock-cash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ party }),
    });
    if (!res.ok) throw new Error(`Failed to lock cash leg: ${res.status}`);
    return res.json();
  }

  async lockAssetLeg(tradeId: string, party: string): Promise<Trade> {
    const res = await fetch(`${this.baseUrl}/trades/${tradeId}/lock-asset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ party }),
    });
    if (!res.ok) throw new Error(`Failed to lock asset leg: ${res.status}`);
    return res.json();
  }

  async settleTrade(tradeId: string): Promise<Trade> {
    const res = await fetch(`${this.baseUrl}/trades/${tradeId}/settle`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to settle trade: ${res.status}`);
    return res.json();
  }

  async cancelTrade(tradeId: string, party: string): Promise<Trade> {
    const res = await fetch(`${this.baseUrl}/trades/${tradeId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ party }),
    });
    if (!res.ok) throw new Error(`Failed to cancel trade: ${res.status}`);
    return res.json();
  }

  async refundTrade(tradeId: string): Promise<Trade> {
    const res = await fetch(`${this.baseUrl}/trades/${tradeId}/refund`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to refund trade: ${res.status}`);
    return res.json();
  }

  async matchInstructions(buy: TradeInstruction, sell: TradeInstruction): Promise<MatchResult> {
    const res = await fetch(`${this.baseUrl}/trades/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buy, sell }),
    });
    if (!res.ok) throw new Error(`Failed to match instructions: ${res.status}`);
    return res.json();
  }

  async intakeInstruction(instruction: TradeInstruction): Promise<{ queued: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/trades/instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(instruction),
    });
    if (!res.ok) throw new Error(`Failed to intake instruction: ${res.status}`);
    return res.json();
  }

  async getNearExpiry(buffer: number = 100): Promise<Trade[]> {
    const res = await fetch(`${this.baseUrl}/trades/near-expiry?buffer=${buffer}`);
    if (!res.ok) throw new Error(`Failed to fetch near-expiry trades: ${res.status}`);
    return res.json();
  }
}
