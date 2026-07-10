import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StellarService } from '../../services/stellar.service';

@Component({
  selector: 'app-wallet-connect',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './wallet-connect.html',
  styleUrl: './wallet-connect.css',
})
export class WalletConnect {
  private stellarService = inject(StellarService);
  wallet$ = this.stellarService.wallet$;
  error: string | null = null;
  connecting = false;

  get freighterAvailable(): boolean {
    return this.stellarService.isFreighterAvailable();
  }

  async connect() {
    this.error = null;
    this.connecting = true;
    try {
      await this.stellarService.connectWallet();
    } catch (err: any) {
      this.error = err.message || 'Failed to connect wallet';
    } finally {
      this.connecting = false;
    }
  }

  disconnect() {
    this.stellarService.disconnectWallet();
    this.error = null;
  }
}
