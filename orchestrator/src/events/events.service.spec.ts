import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { TradeEvent, EventType } from './trade-event.entity';

describe('EventsService', () => {
  let service: EventsService;

  const mockEvent: TradeEvent = {
    id: 'event-uuid',
    tradeId: 'abc123',
    event: EventType.TRADE_INITIALIZED,
    data: { partyA: 'GA' },
    ledgerSeq: 5000,
    txHash: 'txhash123',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(TradeEvent),
          useValue: {
            create: jest.fn().mockReturnValue(mockEvent),
            save: jest.fn().mockResolvedValue(mockEvent),
            find: jest.fn().mockResolvedValue([mockEvent]),
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should record an event', async () => {
    const result = await service.recordEvent({
      tradeId: 'abc123',
      event: EventType.TRADE_INITIALIZED,
    });
    expect(result).toEqual(mockEvent);
  });

  it('should find events by trade id', async () => {
    const events = await service.findByTradeId('abc123');
    expect(events).toHaveLength(1);
  });
});
