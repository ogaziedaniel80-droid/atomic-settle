import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum EventType {
  TRADE_INITIALIZED = 'trade_initialized',
  CASH_LOCKED = 'cash_locked',
  ASSET_LOCKED = 'asset_locked',
  BOTH_LOCKED = 'both_locked',
  SETTLED = 'settled',
  REFUNDING = 'refunding',
  REFUNDED = 'refunded',
  COMPLIANCE_CHECK = 'compliance_check',
  CANCELLED = 'cancelled',
}

@Entity('trade_events')
export class TradeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trade_id', type: 'varchar', length: 64 })
  tradeId: string;

  @Column({
    type: 'enum',
    enum: EventType,
  })
  event: EventType;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({ name: 'ledger_seq', type: 'integer', nullable: true })
  ledgerSeq: number;

  @Column({ name: 'tx_hash', type: 'varchar', length: 64, nullable: true })
  txHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
