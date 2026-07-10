import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Trade, TradeState } from '../../models/trade';
import { ApiService } from '../../services/api.service';
import { WebSocketService, TradeEventMessage } from '../../services/websocket.service';

@Component({
  selector: 'app-exception-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exception-panel.html',
  styleUrl: './exception-panel.css',
})
export class ExceptionPanel {
  @Input() trades: Trade[] = [];

  api = inject(ApiService);
  private ws = inject(WebSocketService);
  nearExpiryTrades: Trade[] = [];
  failedTrades: Trade[] = [];
  recentAlerts: { tradeId: string; event: string; timestamp: string }[] = [];

  ngOnInit() {
    this.loadNearExpiry();
    this.ws.tradeEvents$.subscribe((msg: TradeEventMessage) => {
      if (msg.event === 'compliance_failed' || msg.event.includes('refund')) {
        this.recentAlerts.unshift({
          tradeId: msg.data?.tradeId || 'unknown',
          event: msg.event,
          timestamp: msg.timestamp,
        });
        if (this.recentAlerts.length > 20) this.recentAlerts.pop();
        this.loadNearExpiry();
      }
    });
  }

  ngOnChanges() {
    this.failedTrades = this.trades.filter(
      (t) => t.state === TradeState.REFUNDING || t.state === TradeState.REFUNDED,
    );
  }

  private async loadNearExpiry() {
    try {
      this.nearExpiryTrades = await this.api.getNearExpiry(100);
    } catch {
      // silently fail
    }
  }

  get hasExceptions(): boolean {
    return this.nearExpiryTrades.length > 0 || this.failedTrades.length > 0 || this.recentAlerts.length > 0;
  }
}
