import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject, Observable } from 'rxjs';

export interface TradeEventMessage {
  event: string;
  data: any;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private socket: Socket | null = null;
  private tradeEventsSubject = new Subject<TradeEventMessage>();
  private connectedSubject = new Subject<boolean>();

  connect(url: string = 'http://localhost:3000') {
    if (this.socket?.connected) return;

    this.socket = io(url, {
      path: '/events',
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.connectedSubject.next(true);
    });

    this.socket.on('disconnect', () => {
      this.connectedSubject.next(false);
    });

    this.socket.on('trade_event', (msg: TradeEventMessage) => {
      this.tradeEventsSubject.next(msg);
    });

    this.socket.on('connected', (msg: any) => {
      console.log('WebSocket connected:', msg);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  get tradeEvents$(): Observable<TradeEventMessage> {
    return this.tradeEventsSubject.asObservable();
  }

  get connected$(): Observable<boolean> {
    return this.connectedSubject.asObservable();
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}
