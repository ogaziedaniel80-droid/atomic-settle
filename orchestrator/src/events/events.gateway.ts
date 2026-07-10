import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    client.emit('connected', { message: 'Connected to Atomic Settle event stream' });
  }

  handleDisconnect(_client: Socket) {
    // client disconnected
  }

  broadcastTradeEvent(event: string, data: any) {
    this.server.emit('trade_event', { event, data, timestamp: new Date().toISOString() });
  }
}
