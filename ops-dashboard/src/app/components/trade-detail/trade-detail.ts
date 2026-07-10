import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Trade, TradeState } from '../../models/trade';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-trade-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trade-detail.html',
  styleUrl: './trade-detail.css',
})
export class TradeDetail {
  @Input() trade!: Trade;
  @Output() updated = new EventEmitter<void>();

  private api = inject(ApiService);
  loading = false;
  error: string | null = null;

  get stateClass(): string {
    switch (this.trade.state) {
      case TradeState.CREATED: return 'state-created';
      case TradeState.PARTIALLY_LOCKED: return 'state-partial';
      case TradeState.BOTH_LOCKED: return 'state-locked';
      case TradeState.SETTLED: return 'state-settled';
      case TradeState.REFUNDING: return 'state-refunding';
      case TradeState.REFUNDED: return 'state-refunded';
      default: return '';
    }
  }

  async lockCash() {
    this.loading = true;
    this.error = null;
    try {
      await this.api.lockCashLeg(this.trade.tradeId, this.trade.partyA);
      this.updated.emit();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async lockAsset() {
    this.loading = true;
    this.error = null;
    try {
      await this.api.lockAssetLeg(this.trade.tradeId, this.trade.partyB);
      this.updated.emit();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async settle() {
    this.loading = true;
    this.error = null;
    try {
      await this.api.settleTrade(this.trade.tradeId);
      this.updated.emit();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async cancel() {
    this.loading = true;
    this.error = null;
    try {
      await this.api.cancelTrade(this.trade.tradeId, this.trade.partyA);
      this.updated.emit();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async refund() {
    this.loading = true;
    this.error = null;
    try {
      await this.api.refundTrade(this.trade.tradeId);
      this.updated.emit();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  get canLockCash(): boolean {
    return this.trade.state === TradeState.CREATED || this.trade.state === TradeState.PARTIALLY_LOCKED;
  }

  get canLockAsset(): boolean {
    return this.trade.state === TradeState.CREATED || this.trade.state === TradeState.PARTIALLY_LOCKED;
  }

  get canSettle(): boolean {
    return this.trade.state === TradeState.BOTH_LOCKED;
  }

  get canCancel(): boolean {
    return this.trade.state === TradeState.PARTIALLY_LOCKED;
  }

  get canRefund(): boolean {
    return this.trade.state === TradeState.REFUNDING;
  }
}
