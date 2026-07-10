import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TradesService } from './trades.service';
import { Trade, TradeState } from './trade.entity';
import { SorobanService } from '../soroban/soroban.service';
import { ComplianceService } from '../compliance/compliance.service';
import { EventsGateway } from '../events/events.gateway';

describe('TradesService', () => {
  let service: TradesService;
  let sorobanService: SorobanService;
  let complianceService: ComplianceService;
  let eventsGateway: EventsGateway;

  const mockTrade: Trade = Object.assign(new Trade(), {
    id: 'uuid-1',
    tradeId: 'abc123',
    partyA: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    partyB: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBHQ',
    cashToken: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCD',
    cashAmount: '1000000000',
    assetToken: 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDC',
    assetAmount: '100',
    complianceGate: 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEB',
    expiryLedger: 100000,
    state: TradeState.CREATED,
    cashLocked: false,
    assetLocked: false,
    contractId: 'CAFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFDFD',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createPartialLocked = () => Object.assign(new Trade(), {
    ...mockTrade, tradeId: 'partial-locked', state: TradeState.PARTIALLY_LOCKED, cashLocked: true,
  });

  const createBothLocked = () => Object.assign(new Trade(), {
    ...mockTrade, tradeId: 'both-locked', state: TradeState.BOTH_LOCKED, cashLocked: true, assetLocked: true,
  });

  const createRefunding = () => Object.assign(new Trade(), {
    ...mockTrade, tradeId: 'refunding', state: TradeState.REFUNDING,
  });

  let tradeStore: Map<string, Trade>;
  let repoMock: any;

  function makeRepoMock() {
    tradeStore = new Map();
    tradeStore.set('abc123', Object.assign(new Trade(), { ...mockTrade }));
    tradeStore.set('partial-locked', createPartialLocked());
    tradeStore.set('both-locked', createBothLocked());
    tradeStore.set('refunding', createRefunding());

    repoMock = {
      create: jest.fn((data) => Object.assign(new Trade(), data)),
      save: jest.fn((trade) => Promise.resolve(trade)),
      find: jest.fn(() => Promise.resolve(Array.from(tradeStore.values()))),
      findOne: jest.fn((opts: any) => {
        const id = opts?.where?.tradeId || opts?.where?.id;
        return Promise.resolve(tradeStore.get(id) || null);
      }),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(() => Promise.resolve([mockTrade])),
      })),
    };
  }

  beforeEach(async () => {
    makeRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradesService,
        { provide: getRepositoryToken(Trade), useValue: repoMock },
        {
          provide: SorobanService,
          useValue: {
            simulateTransaction: jest.fn().mockResolvedValue({ result: { status: 'success' } }),
            sendTransaction: jest.fn().mockResolvedValue({ result: { status: 'success' } }),
            getContractData: jest.fn().mockResolvedValue({ result: { ledger: 50000 } }),
            getRpcUrl: jest.fn().mockReturnValue('http://localhost:8000/soroban/rpc'),
          },
        },
        {
          provide: ComplianceService,
          useValue: { checkParty: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: EventsGateway,
          useValue: { broadcastTradeEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TradesService>(TradesService);
    sorobanService = module.get<SorobanService>(SorobanService);
    complianceService = module.get<ComplianceService>(ComplianceService);
    eventsGateway = module.get<EventsGateway>(EventsGateway);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTrade', () => {
    it('should create a trade', async () => {
      const result = await service.createTrade({
        partyA: mockTrade.partyA,
        partyB: mockTrade.partyB,
        cashToken: mockTrade.cashToken,
        cashAmount: mockTrade.cashAmount,
        assetToken: mockTrade.assetToken,
        assetAmount: mockTrade.assetAmount,
        complianceGate: mockTrade.complianceGate,
        expiryLedger: mockTrade.expiryLedger,
      });
      expect(result).toBeDefined();
      expect(result.partyA).toBe(mockTrade.partyA);
    });
  });

  describe('findAll', () => {
    it('should find all trades', async () => {
      const trades = await service.findAll();
      expect(trades).toHaveLength(4);
    });
  });

  describe('findOne', () => {
    it('should find one trade by tradeId', async () => {
      const trade = await service.findOne('abc123');
      expect(trade).toBeDefined();
    });

    it('should throw NotFoundException for missing trade', async () => {
      await expect(service.findOne('nonexistent')).rejects.toThrow();
    });
  });

  describe('updateState', () => {
    it('should update trade state', async () => {
      const trade = await service.updateState('abc123', TradeState.BOTH_LOCKED, {
        cashLocked: true,
        assetLocked: true,
      });
      expect(trade.state).toBe(TradeState.BOTH_LOCKED);
    });
  });

  describe('lockCashLeg', () => {
    it('should lock cash leg for party A', async () => {
      const trade = await service.lockCashLeg('abc123', mockTrade.partyA);
      expect(trade.cashLocked).toBe(true);
      expect(eventsGateway.broadcastTradeEvent).toHaveBeenCalledWith('cash_locked', expect.any(Object));
    });

    it('should throw if not party A', async () => {
      await expect(service.lockCashLeg('abc123', mockTrade.partyB)).rejects.toThrow();
    });

    it('should throw for nonexistent trade', async () => {
      await expect(service.lockCashLeg('nonexistent', 'GA')).rejects.toThrow();
    });
  });

  describe('lockAssetLeg', () => {
    it('should lock asset leg for party B', async () => {
      const trade = await service.lockAssetLeg('abc123', mockTrade.partyB);
      expect(trade.assetLocked).toBe(true);
      expect(eventsGateway.broadcastTradeEvent).toHaveBeenCalledWith('asset_locked', expect.any(Object));
    });

    it('should throw if not party B', async () => {
      await expect(service.lockAssetLeg('abc123', mockTrade.partyA)).rejects.toThrow();
    });
  });

  describe('settleTrade', () => {
    it('should settle a both-locked trade', async () => {
      const trade = await service.settleTrade('both-locked');
      expect(trade.state).toBe(TradeState.SETTLED);
      expect(complianceService.checkParty).toHaveBeenCalled();
      expect(eventsGateway.broadcastTradeEvent).toHaveBeenCalledWith('settled', expect.any(Object));
    });

    it('should throw if trade is not both-locked', async () => {
      await expect(service.settleTrade('abc123')).rejects.toThrow('Both legs must be locked before settling');
    });

    it('should move to refunding if compliance fails', async () => {
      jest.spyOn(complianceService, 'checkParty').mockResolvedValue(false);
      await expect(service.settleTrade('both-locked')).rejects.toThrow('Compliance check failed');
    });
  });

  describe('cancelTrade', () => {
    it('should cancel a partially locked trade', async () => {
      const trade = await service.cancelTrade('partial-locked', mockTrade.partyA);
      expect(trade.state).toBe(TradeState.REFUNDED);
      expect(eventsGateway.broadcastTradeEvent).toHaveBeenCalledWith('cancelled', expect.any(Object));
    });

    it('should throw if not partially locked', async () => {
      await expect(service.cancelTrade('abc123', mockTrade.partyA)).rejects.toThrow();
    });
  });

  describe('refundTrade', () => {
    it('should refund a refunding trade', async () => {
      const trade = await service.refundTrade('refunding');
      expect(trade.state).toBe(TradeState.REFUNDED);
      expect(eventsGateway.broadcastTradeEvent).toHaveBeenCalledWith('refunded', expect.any(Object));
    });
  });

  describe('matchTradeInstructions', () => {
    it('should match compatible instructions', async () => {
      const buy = {
        institution: 'GA',
        assetToken: 'TOKEN',
        assetAmount: '100',
        cashToken: 'CASH',
        cashAmount: '1000',
      };
      const sell = {
        institution: 'GB',
        assetToken: 'TOKEN',
        assetAmount: '100',
        cashToken: 'CASH',
        cashAmount: '1000',
      };
      const result = await service.matchTradeInstructions(buy, sell);
      expect(result).not.toBeNull();
      expect(result!.partyA).toBe('GA');
      expect(result!.partyB).toBe('GB');
    });

    it('should reject mismatched instructions', async () => {
      const buy = {
        institution: 'GA',
        assetToken: 'TOKEN',
        assetAmount: '100',
        cashToken: 'CASH',
        cashAmount: '1000',
      };
      const sell = {
        institution: 'GB',
        assetToken: 'TOKEN',
        assetAmount: '200',
        cashToken: 'CASH',
        cashAmount: '2000',
      };
      const result = await service.matchTradeInstructions(buy, sell);
      expect(result).toBeNull();
    });
  });

  describe('intakeInstruction', () => {
    it('should queue an instruction', async () => {
      const result = await service.intakeInstruction({
        institution: 'GA',
        side: 'buy',
        assetToken: 'TOKEN',
        assetAmount: '100',
        cashToken: 'CASH',
        cashAmount: '1000',
      });
      expect(result.queued).toBe(true);
    });
  });

  describe('findNearExpiry', () => {
    it('should find trades near expiry', async () => {
      const trades = await service.findNearExpiry(100);
      expect(trades).toHaveLength(1);
    });
  });
});
