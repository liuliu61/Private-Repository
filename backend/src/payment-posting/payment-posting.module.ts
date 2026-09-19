import { Module } from '@nestjs/common';
import { PaymentPostingController } from './payment-posting.controller';
import { PaymentPostingService } from './payment-posting.service';

@Module({
  controllers: [PaymentPostingController],
  providers: [PaymentPostingService],
  exports: [PaymentPostingService],
})
export class PaymentPostingModule {}
