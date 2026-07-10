import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SorobanResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly rpcUrl: string;
  private readonly networkPassphrase: string;

  constructor(private readonly configService: ConfigService) {
    this.rpcUrl = this.configService.get<string>(
      'SOROBAN_RPC_URL',
      'http://localhost:8000/soroban/rpc',
    );
    this.networkPassphrase = this.configService.get<string>(
      'SOROBAN_NETWORK_PASSPHRASE',
      'Standalone Network ; February 2017',
    );
  }

  async simulateTransaction(
    contractId: string,
    functionName: string,
    args: any[],
    source?: string,
  ): Promise<SorobanResponse> {
    return this.rpcCall('simulateTransaction', {
      transaction: this.buildSorobanTransaction(contractId, functionName, args, source),
    });
  }

  async sendTransaction(
    contractId: string,
    functionName: string,
    args: any[],
    source: string,
  ): Promise<SorobanResponse> {
    return this.rpcCall('sendTransaction', {
      transaction: this.buildSorobanTransaction(contractId, functionName, args, source),
    });
  }

  async getTransaction(hash: string): Promise<SorobanResponse> {
    return this.rpcCall('getTransaction', { hash });
  }

  async getContractData(contractId: string, key: string): Promise<SorobanResponse> {
    return this.rpcCall('getContractData', {
      contractId,
      key,
    });
  }

  private buildSorobanTransaction(
    _contractId: string,
    _functionName: string,
    _args: any[],
    _source?: string,
  ): any {
    return {
      sourceAccount: _source || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      operations: [
        {
          contractId: _contractId,
          functionName: _functionName,
          args: _args,
        },
      ],
      networkPassphrase: this.networkPassphrase,
    };
  }

  private async rpcCall(method: string, params: any): Promise<SorobanResponse> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`RPC ${method} returned ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      this.logger.error(`RPC call ${method} failed`, err.message);
      throw err;
    }
  }

  getRpcUrl(): string {
    return this.rpcUrl;
  }
}
