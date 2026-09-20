import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PaymentPostingController } from './payment-posting.controller';
import { PaymentPostingService } from './payment-posting.service';

@Module({
  imports: [CommonModule],
  controllers: [PaymentPostingController],
  providers: [PaymentPostingService],
  exports: [PaymentPostingService],
})
export class PaymentPostingModule {}
