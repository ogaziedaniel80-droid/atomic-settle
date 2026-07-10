import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradeEvent, EventType } from './trade-event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(TradeEvent)
    private eventsRepository: Repository<TradeEvent>,
  ) {}

  async recordEvent(params: {
    tradeId: string;
    event: EventType;
    data?: Record<string, any>;
    ledgerSeq?: number;
    txHash?: string;
  }): Promise<TradeEvent> {
    const event = this.eventsRepository.create({
      tradeId: params.tradeId,
      event: params.event,
      data: params.data,
      ledgerSeq: params.ledgerSeq,
      txHash: params.txHash,
    });
    return this.eventsRepository.save(event);
  }

  async findByTradeId(tradeId: string): Promise<TradeEvent[]> {
    return this.eventsRepository.find({
      where: { tradeId },
      order: { createdAt: 'ASC' },
    });
  }

  async findRecent(limit: number = 100): Promise<TradeEvent[]> {
    return this.eventsRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
