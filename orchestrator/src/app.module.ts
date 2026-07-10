import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database.module';
import { TradesModule } from './trades/trades.module';
import { EventsModule } from './events/events.module';
import { ComplianceModule } from './compliance/compliance.module';
import { SorobanModule } from './soroban/soroban.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    SorobanModule,
    TradesModule,
    EventsModule,
    ComplianceModule,
  ],
})
export class AppModule {}
