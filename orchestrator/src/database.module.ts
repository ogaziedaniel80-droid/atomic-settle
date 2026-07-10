import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Trade } from './trades/trade.entity';
import { TradeEvent } from './events/trade-event.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'atomic_settle'),
        password: config.get('DB_PASSWORD', 'atomic_settle'),
        database: config.get('DB_DATABASE', 'atomic_settle'),
        entities: [Trade, TradeEvent],
        synchronize: config.get('DB_SYNC', 'true') === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}
