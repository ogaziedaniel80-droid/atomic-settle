import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Trade, TradeState } from './trade.entity';
import { SorobanService } from '../soroban/soroban.service';
import { ComplianceService } from '../compliance/compliance.service';
import { EventsGateway } from '../events/events.gateway';
import * as crypto from 'crypto';

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    @InjectRepository(Trade)
    private tradesRepository: Repository<Trade>,
    private readonly sorobanService: SorobanService,
    private readonly complianceService: ComplianceService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  private generateTradeId(partyA: string, partyB: string, nonce: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(`${partyA}:${partyB}:${nonce}:${Date.now()}`);
    return hash.digest('hex');
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
    const tradeId = this.generateTradeId(params.partyA, params.partyB, params.cashToken);

    const existing = await this.tradesRepository.findOne({ where: { tradeId } });
    if (existing) {
      throw new ConflictException('Trade with generated ID already exists');
    }

    const trade = this.tradesRepository.create({
      tradeId,
      partyA: params.partyA,
      partyB: params.partyB,
      cashToken: params.cashToken,
      cashAmount: params.cashAmount,
      assetToken: params.assetToken,
      assetAmount: params.assetAmount,
      complianceGate: params.complianceGate,
      expiryLedger: params.expiryLedger,
      contractId: params.contractId,
      state: TradeState.CREATED,
      cashLocked: false,
      assetLocked: false,
    });

    return this.tradesRepository.save(trade);
  }

  async findAll(): Promise<Trade[]> {
    return this.tradesRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(tradeId: string): Promise<Trade> {
    const trade = await this.tradesRepository.findOne({ where: { tradeId } });
    if (!trade) {
      throw new NotFoundException(`Trade ${tradeId} not found`);
    }
    return trade;
  }

  async updateState(
    tradeId: string,
    state: TradeState,
    changes?: { cashLocked?: boolean; assetLocked?: boolean },
  ): Promise<Trade> {
    const trade = await this.findOne(tradeId);
    trade.state = state;
    if (changes?.cashLocked !== undefined) trade.cashLocked = changes.cashLocked;
    if (changes?.assetLocked !== undefined) trade.assetLocked = changes.assetLocked;
    return this.tradesRepository.save(trade);
  }

  async findByState(state: TradeState): Promise<Trade[]> {
    return this.tradesRepository.find({ where: { state } });
  }

  async findNearExpiry(ledgerBuffer: number): Promise<Trade[]> {
    const currentLedger = await this.getCurrentLedger();
    const nearExpiryLedger = currentLedger + ledgerBuffer;
    return this.tradesRepository
      .createQueryBuilder('trade')
      .where('trade.state IN (:...states)', {
        states: [TradeState.CREATED, TradeState.PARTIALLY_LOCKED, TradeState.BOTH_LOCKED],
      })
      .andWhere('trade.expiry_ledger <= :nearExpiryLedger', { nearExpiryLedger })
      .getMany();
  }

  async lockCashLeg(tradeId: string, party: string): Promise<Trade> {
    const trade = await this.findOne(tradeId);

    if (trade.state !== TradeState.CREATED && trade.state !== TradeState.PARTIALLY_LOCKED) {
      throw new BadRequestException('Cannot lock cash leg in current state');
    }
    if (trade.cashLocked) {
      throw new BadRequestException('Cash leg already locked');
    }
    if (party !== trade.partyA) {
      throw new BadRequestException('Only party A can lock cash');
    }

    const contractId = trade.contractId || '';
    if (!contractId) {
      throw new BadRequestException('Contract not deployed for this trade');
    }

    const result = await this.sorobanService.simulateTransaction(
      contractId,
      'lock_cash_leg',
      [tradeId, party],
      party,
    );

    if (result.error) {
      throw new BadRequestException(`Soroban error: ${result.error.message}`);
    }

    trade.cashLocked = true;
    trade.state = trade.assetLocked ? TradeState.BOTH_LOCKED : TradeState.PARTIALLY_LOCKED;
    const updated = await this.tradesRepository.save(trade);

    this.eventsGateway.broadcastTradeEvent('cash_locked', {
      tradeId, party, state: updated.state,
    });

    return updated;
  }

  async lockAssetLeg(tradeId: string, party: string): Promise<Trade> {
    const trade = await this.findOne(tradeId);

    if (trade.state !== TradeState.CREATED && trade.state !== TradeState.PARTIALLY_LOCKED) {
      throw new BadRequestException('Cannot lock asset leg in current state');
    }
    if (trade.assetLocked) {
      throw new BadRequestException('Asset leg already locked');
    }
    if (party !== trade.partyB) {
      throw new BadRequestException('Only party B can lock asset');
    }

    const contractId = trade.contractId || '';
    if (!contractId) {
      throw new BadRequestException('Contract not deployed for this trade');
    }

    const result = await this.sorobanService.simulateTransaction(
      contractId,
      'lock_asset_leg',
      [tradeId, party],
      party,
    );

    if (result.error) {
      throw new BadRequestException(`Soroban error: ${result.error.message}`);
    }

    trade.assetLocked = true;
    trade.state = trade.cashLocked ? TradeState.BOTH_LOCKED : TradeState.PARTIALLY_LOCKED;
    const updated = await this.tradesRepository.save(trade);

    this.eventsGateway.broadcastTradeEvent('asset_locked', {
      tradeId, party, state: updated.state,
    });

    return updated;
  }

  async settleTrade(tradeId: string): Promise<Trade> {
    const trade = await this.findOne(tradeId);

    if (trade.state !== TradeState.BOTH_LOCKED) {
      throw new BadRequestException('Both legs must be locked before settling');
    }

    const [partyAOk, partyBOk] = await Promise.all([
      this.complianceService.checkParty(trade.partyA, trade.assetToken, trade.assetAmount),
      this.complianceService.checkParty(trade.partyB, trade.cashToken, trade.cashAmount),
    ]);

    if (!partyAOk || !partyBOk) {
      trade.state = TradeState.REFUNDING;
      await this.tradesRepository.save(trade);
      this.eventsGateway.broadcastTradeEvent('compliance_failed', {
        tradeId, reason: 'Compliance check failed',
      });
      throw new BadRequestException('Compliance check failed - trade moving to refund');
    }

    const contractId = trade.contractId || '';
    if (!contractId) {
      throw new BadRequestException('Contract not deployed for this trade');
    }

    const result = await this.sorobanService.simulateTransaction(
      contractId,
      'settle',
      [tradeId],
    );

    if (result.error) {
      throw new BadRequestException(`Soroban error: ${result.error.message}`);
    }

    trade.state = TradeState.SETTLED;
    const updated = await this.tradesRepository.save(trade);

    this.eventsGateway.broadcastTradeEvent('settled', { tradeId });

    return updated;
  }

  async cancelTrade(tradeId: string, party: string): Promise<Trade> {
    const trade = await this.findOne(tradeId);

    if (trade.state !== TradeState.PARTIALLY_LOCKED) {
      throw new BadRequestException('Can only cancel when partially locked');
    }

    const contractId = trade.contractId || '';
    if (!contractId) {
      throw new BadRequestException('Contract not deployed for this trade');
    }

    const result = await this.sorobanService.simulateTransaction(
      contractId,
      'cancel',
      [tradeId, party],
      party,
    );

    if (result.error) {
      throw new BadRequestException(`Soroban error: ${result.error.message}`);
    }

    trade.cashLocked = false;
    trade.assetLocked = false;
    trade.state = TradeState.REFUNDED;
    const updated = await this.tradesRepository.save(trade);

    this.eventsGateway.broadcastTradeEvent('cancelled', { tradeId });

    return updated;
  }

  async refundTrade(tradeId: string): Promise<Trade> {
    const trade = await this.findOne(tradeId);

    if (trade.state !== TradeState.REFUNDING) {
      const currentLedger = await this.getCurrentLedger();
      if (currentLedger < trade.expiryLedger) {
        throw new BadRequestException('Refund not available yet - trade not expired or not in refunding state');
      }
    }

    const contractId = trade.contractId || '';
    if (!contractId) {
      throw new BadRequestException('Contract not deployed for this trade');
    }

    const result = await this.sorobanService.simulateTransaction(
      contractId,
      'refund',
      [tradeId],
    );

    if (result.error) {
      throw new BadRequestException(`Soroban error: ${result.error.message}`);
    }

    trade.cashLocked = false;
    trade.assetLocked = false;
    trade.state = TradeState.REFUNDED;
    const updated = await this.tradesRepository.save(trade);

    this.eventsGateway.broadcastTradeEvent('refunded', { tradeId });

    return updated;
  }

  async intakeInstruction(instruction: {
    institution: string;
    side: 'buy' | 'sell';
    assetToken: string;
    assetAmount: string;
    cashToken: string;
    cashAmount: string;
  }): Promise<{ queued: boolean; message: string }> {
    this.logger.log(`Intake instruction from ${instruction.institution} for ${instruction.side}`);
    return { queued: true, message: 'Instruction received and queued for matching' };
  }

  async getCurrentLedger(): Promise<number> {
    try {
      const result = await this.sorobanService.getContractData(
        '0000000000000000000000000000000000000000000000000000000000000000',
        'ledger',
      );
      return result?.result?.ledger || 0;
    } catch {
      return 0;
    }
  }

  async matchTradeInstructions(
    buyInstruction: {
      institution: string;
      assetToken: string;
      assetAmount: string;
      cashToken: string;
      cashAmount: string;
    },
    sellInstruction: {
      institution: string;
      assetToken: string;
      assetAmount: string;
      cashToken: string;
      cashAmount: string;
    },
  ): Promise<{
    partyA: string;
    partyB: string;
    cashToken: string;
    cashAmount: string;
    assetToken: string;
    assetAmount: string;
  } | null> {
    const amountMatches =
      buyInstruction.assetAmount === sellInstruction.assetAmount &&
      buyInstruction.cashAmount === sellInstruction.cashAmount;

    const tokenMatches =
      buyInstruction.assetToken === sellInstruction.assetToken &&
      buyInstruction.cashToken === sellInstruction.cashToken;

    if (!amountMatches || !tokenMatches) {
      return null;
    }

    return {
      partyA: buyInstruction.institution,
      partyB: sellInstruction.institution,
      cashToken: buyInstruction.cashToken,
      cashAmount: buyInstruction.cashAmount,
      assetToken: buyInstruction.assetToken,
      assetAmount: buyInstruction.assetAmount,
    };
  }
}
