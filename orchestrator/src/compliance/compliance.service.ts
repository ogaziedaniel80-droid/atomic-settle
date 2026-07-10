import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private readonly configService: ConfigService) {}

  async checkParty(party: string, asset: string, _amount: string): Promise<boolean> {
    const complianceUrl = this.configService.get(
      'COMPLIANCE_CHECK_URL',
      'http://localhost:8000/compliance/check',
    );

    try {
      const response = await fetch(complianceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ party, asset, amount: _amount }),
      });

      if (!response.ok) {
        this.logger.warn(`Compliance check failed for ${party}`);
        return false;
      }

      const result = await response.json();
      return result.allowed === true;
    } catch (err) {
      this.logger.error(`Compliance check error for ${party}`, err.message);
      return false;
    }
  }
}
