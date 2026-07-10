import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TradesService } from './trades.service';
import { Trade } from './trade.entity';

class CreateTradeDto {
  partyA: string;
  partyB: string;
  cashToken: string;
  cashAmount: string;
  assetToken: string;
  assetAmount: string;
  complianceGate: string;
  expiryLedger: number;
  contractId?: string;
}

class MatchInstructionsDto {
  buy: {
    institution: string;
    assetToken: string;
    assetAmount: string;
    cashToken: string;
    cashAmount: string;
  };
  sell: {
    institution: string;
    assetToken: string;
    assetAmount: string;
    cashToken: string;
    cashAmount: string;
  };
}

class IntakeInstructionDto {
  institution: string;
  side: 'buy' | 'sell';
  assetToken: string;
  assetAmount: string;
  cashToken: string;
  cashAmount: string;
}

class LockLegDto {
  party: string;
}

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Post()
  async create(@Body() dto: CreateTradeDto): Promise<Trade> {
    return this.tradesService.createTrade(dto);
  }

  @Post('match')
  async matchInstructions(@Body() dto: MatchInstructionsDto) {
    const matched = await this.tradesService.matchTradeInstructions(
      dto.buy,
      dto.sell,
    );
    if (!matched) {
      return { matched: false, message: 'Instructions do not match' };
    }
    return { matched: true, trade: matched };
  }

  @Post('instructions')
  async intakeInstruction(@Body() dto: IntakeInstructionDto) {
    return this.tradesService.intakeInstruction(dto);
  }

  @Post(':tradeId/lock-cash')
  async lockCashLeg(
    @Param('tradeId') tradeId: string,
    @Body() dto: LockLegDto,
  ): Promise<Trade> {
    return this.tradesService.lockCashLeg(tradeId, dto.party);
  }

  @Post(':tradeId/lock-asset')
  async lockAssetLeg(
    @Param('tradeId') tradeId: string,
    @Body() dto: LockLegDto,
  ): Promise<Trade> {
    return this.tradesService.lockAssetLeg(tradeId, dto.party);
  }

  @Post(':tradeId/settle')
  async settleTrade(@Param('tradeId') tradeId: string): Promise<Trade> {
    return this.tradesService.settleTrade(tradeId);
  }

  @Post(':tradeId/cancel')
  async cancelTrade(
    @Param('tradeId') tradeId: string,
    @Body() dto: LockLegDto,
  ): Promise<Trade> {
    return this.tradesService.cancelTrade(tradeId, dto.party);
  }

  @Post(':tradeId/refund')
  async refundTrade(@Param('tradeId') tradeId: string): Promise<Trade> {
    return this.tradesService.refundTrade(tradeId);
  }

  @Get()
  async findAll(): Promise<Trade[]> {
    return this.tradesService.findAll();
  }

  @Get('near-expiry')
  async findNearExpiry(@Query('buffer') buffer: string) {
    return this.tradesService.findNearExpiry(parseInt(buffer, 10) || 100);
  }

  @Get(':tradeId')
  async findOne(@Param('tradeId') tradeId: string): Promise<Trade> {
    return this.tradesService.findOne(tradeId);
  }

  @Patch(':tradeId/state')
  async updateState(
    @Param('tradeId') tradeId: string,
    @Body() body: { state: string; cashLocked?: boolean; assetLocked?: boolean },
  ): Promise<Trade> {
    return this.tradesService.updateState(
      tradeId,
      body.state as any,
      { cashLocked: body.cashLocked, assetLocked: body.assetLocked },
    );
  }
}
