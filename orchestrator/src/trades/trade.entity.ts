import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TradeState {
  CREATED = 'Created',
  PARTIALLY_LOCKED = 'PartiallyLocked',
  BOTH_LOCKED = 'BothLocked',
  SETTLED = 'Settled',
  REFUNDING = 'Refunding',
  REFUNDED = 'Refunded',
}

@Entity('trades')
export class Trade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trade_id', type: 'varchar', length: 64, unique: true })
  tradeId: string;

  @Column({ name: 'party_a', type: 'varchar', length: 56 })
  partyA: string;

  @Column({ name: 'party_b', type: 'varchar', length: 56 })
  partyB: string;

  @Column({ name: 'cash_token', type: 'varchar', length: 56 })
  cashToken: string;

  @Column({ name: 'cash_amount', type: 'bigint' })
  cashAmount: string;

  @Column({ name: 'asset_token', type: 'varchar', length: 56 })
  assetToken: string;

  @Column({ name: 'asset_amount', type: 'bigint' })
  assetAmount: string;

  @Column({ name: 'compliance_gate', type: 'varchar', length: 56 })
  complianceGate: string;

  @Column({ name: 'expiry_ledger', type: 'integer' })
  expiryLedger: number;

  @Column({
    type: 'enum',
    enum: TradeState,
    default: TradeState.CREATED,
  })
  state: TradeState;

  @Column({ name: 'cash_locked', default: false })
  cashLocked: boolean;

  @Column({ name: 'asset_locked', default: false })
  assetLocked: boolean;

  @Column({ name: 'contract_id', type: 'varchar', length: 64, nullable: true })
  contractId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
