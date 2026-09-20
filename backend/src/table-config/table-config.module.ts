import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { TableConfigController } from './table-config.controller';
import { TableConfigService } from './table-config.service';

@Module({ imports: [CommonModule],
  controllers: [TableConfigController],
  providers: [TableConfigService],
  exports: [TableConfigService],
})
export class TableConfigModule {}
