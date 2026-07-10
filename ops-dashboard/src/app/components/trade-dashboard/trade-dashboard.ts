import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Trade, TradeState, TradeInstruction } from '../../models/trade';
import { ApiService } from '../../services/api.service';
import { WebSocketService, TradeEventMessage } from '../../services/websocket.service';
import { StellarService } from '../../services/stellar.service';
import { TradeDetail } from '../trade-detail/trade-detail';
import { ExceptionPanel } from '../exception-panel/exception-panel';

@Component({
  selector: 'app-trade-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, TradeDetail, ExceptionPanel],
  templateUrl: './trade-dashboard.html',
  styleUrl: './trade-dashboard.css',
})
export class TradeDashboard {
  private api = inject(ApiService);
  private ws = inject(WebSocketService);
  private stellar = inject(StellarService);

  trades: Trade[] = [];
  loading = false;
  error: string | null = null;
  wsConnected = false;

  newTrade = {
    partyA: '',
    partyB: '',
    cashToken: '',
    cashAmount: '',
    assetToken: '',
    assetAmount: '',
    complianceGate: 'CAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGY',
    expiryLedger: 100000,
  };

  constructor() {
    this.ws.tradeEvents$.subscribe((msg: TradeEventMessage) => {
      this.handleTradeEvent(msg);
    });

    this.ws.connected$.subscribe((connected) => {
      this.wsConnected = connected;
    });
  }

  ngOnInit() {
    this.ws.connect();
    this.loadTrades();

    this.stellar.wallet$.subscribe((wallet) => {
      if (wallet.connected && wallet.publicKey) {
        this.newTrade.partyA = wallet.publicKey;
      }
    });
  }

  async loadTrades() {
    this.loading = true;
    this.error = null;
    try {
      this.trades = await this.api.getTrades();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async createTrade() {
    this.loading = true;
    this.error = null;
    try {
      await this.api.createTrade({
        partyA: this.newTrade.partyA,
        partyB: this.newTrade.partyB,
        cashToken: this.newTrade.cashToken,
        cashAmount: this.newTrade.cashAmount,
        assetToken: this.newTrade.assetToken,
        assetAmount: this.newTrade.assetAmount,
        complianceGate: this.newTrade.complianceGate,
        expiryLedger: this.newTrade.expiryLedger,
      });
      await this.loadTrades();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async intakeInstruction(instruction: TradeInstruction) {
    this.loading = true;
    this.error = null;
    try {
      await this.api.intakeInstruction(instruction);
      await this.loadTrades();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  private handleTradeEvent(msg: TradeEventMessage) {
    if (msg.event === 'trade_initialized' || msg.event === 'cash_locked' ||
        msg.event === 'asset_locked' || msg.event === 'settled' ||
        msg.event === 'cancelled' || msg.event === 'refunded') {
      this.loadTrades();
    }
  }

  get nearExpiryTrades(): Trade[] {
    return this.trades.filter((t) =>
      t.state === TradeState.CREATED ||
      t.state === TradeState.PARTIALLY_LOCKED ||
      t.state === TradeState.BOTH_LOCKED
    );
  }

  filterByState(state: TradeState): Trade[] {
    return this.trades.filter((t) => t.state === state);
  }
}
