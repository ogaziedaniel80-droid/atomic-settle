import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

declare global {
  interface Window {
    freighter?: {
      isConnected: () => Promise<{ isConnected: boolean }>;
      connect: () => Promise<{ address: string }>;
      getPublicKey: () => Promise<string>;
      signTransaction: (xdr: string, opts?: any) => Promise<{ signedTxXdr: string }>;
    };
  }
}

export interface WalletInfo {
  connected: boolean;
  publicKey: string | null;
}

@Injectable({ providedIn: 'root' })
export class StellarService {
  private walletSubject = new BehaviorSubject<WalletInfo>({
    connected: false,
    publicKey: null,
  });

  get wallet$() {
    return this.walletSubject.asObservable();
  }

  get wallet(): WalletInfo {
    return this.walletSubject.value;
  }

  isFreighterAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.freighter;
  }

  async connectWallet(): Promise<{ address: string }> {
    if (!this.isFreighterAvailable()) {
      throw new Error('Freighter wallet not detected. Please install the Freighter browser extension.');
    }

    const { address } = await window.freighter!.connect();
    const publicKey = await window.freighter!.getPublicKey();

    this.walletSubject.next({ connected: true, publicKey });

    return { address };
  }

  async disconnectWallet() {
    this.walletSubject.next({ connected: false, publicKey: null });
  }

  async signTransaction(xdr: string, opts?: any): Promise<string> {
    if (!this.isFreighterAvailable()) {
      throw new Error('Freighter wallet not detected.');
    }

    const { signedTxXdr } = await window.freighter!.signTransaction(xdr, opts);
    return signedTxXdr;
  }
}
