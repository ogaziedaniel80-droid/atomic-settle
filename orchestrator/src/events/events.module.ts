import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeEvent } from './trade-event.entity';
import { EventsService } from './events.service';
import { SorobanListenerService } from './soroban-listener.service';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([TradeEvent])],
  providers: [EventsService, SorobanListenerService, EventsGateway],
  exports: [EventsService, SorobanListenerService, EventsGateway],
})
export class EventsModule {}
