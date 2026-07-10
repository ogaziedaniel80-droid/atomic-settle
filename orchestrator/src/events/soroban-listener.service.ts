import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsService } from './events.service';
import { EventsGateway } from './events.gateway';
import { EventType } from './trade-event.entity';

interface SorobanEvent {
  type: string;
  ledger: number;
  txHash: string;
  topic: string[];
  data: Record<string, any>;
}

@Injectable()
export class SorobanListenerService implements OnModuleInit {
  private readonly logger = new Logger(SorobanListenerService.name);
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastProcessedLedger: number = 0;

  constructor(
    private readonly eventsService: EventsService,
    private readonly configService: ConfigService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  onModuleInit() {
    const enabled = this.configService.get('EVENT_LISTENER_ENABLED', 'false');
    if (enabled === 'true') {
      this.startListening();
    }
  }

  startListening() {
    const intervalMs = this.configService.get<number>('EVENT_POLL_INTERVAL_MS', 5000);
    this.logger.log(`Starting Soroban event listener (poll every ${intervalMs}ms)`);
    this.pollingInterval = setInterval(() => this.poll(), intervalMs);
  }

  stopListening() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async poll() {
    try {
      await this.fetchAndProcessEvents();
    } catch (err) {
      this.logger.error('Event poll failed', err);
    }
  }

  private async fetchAndProcessEvents() {
    const rpcUrl = this.configService.get(
      'SOROBAN_RPC_URL',
      'http://localhost:8000/soroban/rpc',
    );
    const contractId = this.configService.get(
      'SETTLEMENT_ESCROW_CONTRACT_ID',
      '',
    );

    if (!contractId) {
      this.logger.warn('SETTLEMENT_ESCROW_CONTRACT_ID not configured');
      return;
    }

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getEvents',
          params: {
            startLedger: this.lastProcessedLedger || undefined,
            filters: [
              {
                contractId,
                type: 'contract',
              },
            ],
            pagination: { limit: 100 },
          },
        }),
      });

      if (!response.ok) {
        this.logger.warn(`RPC returned ${response.status}`);
        return;
      }

      const body = await response.json();
      if (!body.result?.events) return;

      for (const event of body.result.events) {
        await this.processEvent(event, contractId);
        if (event.ledger > this.lastProcessedLedger) {
          this.lastProcessedLedger = event.ledger;
        }
      }
    } catch (err) {
      this.logger.error('RPC call failed', err.message);
    }
  }

  private async processEvent(raw: any, _contractId: string) {
    try {
      const event: SorobanEvent = {
        type: raw.type,
        ledger: raw.ledger,
        txHash: raw.txHash,
        topic: raw.topic || [],
        data: raw.value || {},
      };

      const topicStr = event.topic.join(',');
      const mappedEvent = this.mapTopicToEventType(topicStr);
      if (!mappedEvent) return;

      const tradeId = this.extractTradeId(event);
      if (!tradeId) return;

      await this.eventsService.recordEvent({
        tradeId,
        event: mappedEvent,
        data: event.data,
        ledgerSeq: event.ledger,
        txHash: event.txHash,
      });

      this.eventsGateway.broadcastTradeEvent(mappedEvent, {
        tradeId,
        data: event.data,
        ledger: event.ledger,
        txHash: event.txHash,
      });

      this.logger.log(`Recorded event ${mappedEvent} for trade ${tradeId}`);
    } catch (err) {
      this.logger.error('Failed to process event', err);
    }
  }

  private mapTopicToEventType(topic: string): EventType | null {
    if (topic.includes('init_trade') || topic.includes('trade_initialized')) {
      return EventType.TRADE_INITIALIZED;
    }
    if (topic.includes('lock_cash_leg') || topic.includes('cash_locked')) {
      return EventType.CASH_LOCKED;
    }
    if (topic.includes('lock_asset_leg') || topic.includes('asset_locked')) {
      return EventType.ASSET_LOCKED;
    }
    if (topic.includes('both_locked')) {
      return EventType.BOTH_LOCKED;
    }
    if (topic.includes('settle') || topic.includes('settled')) {
      return EventType.SETTLED;
    }
    if (topic.includes('refund')) {
      return EventType.REFUNDED;
    }
    if (topic.includes('cancel')) {
      return EventType.CANCELLED;
    }
    if (topic.includes('compliance')) {
      return EventType.COMPLIANCE_CHECK;
    }
    return null;
  }

  private extractTradeId(event: SorobanEvent): string | null {
    if (event.data?.trade_id) return event.data.trade_id;
    if (event.topic?.length > 1) return event.topic[1];
    return null;
  }
}
