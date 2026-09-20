import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ServiceOrderController } from './service-order.controller';
import { ServiceOrderService } from './service-order.service';

@Module({ imports: [CommonModule],
  controllers: [ServiceOrderController],
  providers: [ServiceOrderService],
  exports: [ServiceOrderService],
})
export class ServiceOrderModule {}
