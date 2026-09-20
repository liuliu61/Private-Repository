import { Module } from '@nestjs/common';
import { CustomerContractService } from './customer-contract.service';
import { CustomerContractController } from './customer-contract.controller';
import { PaymentAccountService } from './payment-account.service';
import { PaymentAccountController } from './business-ext.controller';
import { ServiceFeeConfigService } from './service-fee-config.service';
import { ServiceFeeConfigController } from './business-ext.controller';
import { PolicyChangeRequestService } from './policy-change.service';
import { PolicyChangeRequestController } from './business-ext.controller';
import { ReceiveRefundService } from './receive-refund.service';
import { ReceiveRefundController } from './business-ext.controller';

@Module({
  controllers: [
    CustomerContractController,
    PaymentAccountController,
    ServiceFeeConfigController,
    PolicyChangeRequestController,
    ReceiveRefundController,
  ],
  providers: [
    CustomerContractService,
    PaymentAccountService,
    ServiceFeeConfigService,
    PolicyChangeRequestService,
    ReceiveRefundService,
  ],
  exports: [
    CustomerContractService,
    PaymentAccountService,
    ServiceFeeConfigService,
    PolicyChangeRequestService,
    ReceiveRefundService,
  ],
})
export class BusinessExtModule {}
