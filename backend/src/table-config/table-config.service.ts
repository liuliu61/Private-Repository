import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessContext } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TableConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(tableKey: string, context: AccessContext) {
    const config = await this.prisma.tableColumnConfig.findUnique({
      where: { userId_tableKey: { userId: context.sub, tableKey } },
    });
    if (!config) return { tableKey, columns: null };
    return { tableKey, columns: JSON.parse(config.columns) };
  }

  async saveConfig(tableKey: string, columns: unknown, context: AccessContext) {
    const columnsJson = JSON.stringify(columns);
    await this.prisma.tableColumnConfig.upsert({
      where: { userId_tableKey: { userId: context.sub, tableKey } },
      update: { columns: columnsJson },
      create: { userId: context.sub, tableKey, columns: columnsJson },
    });
    return { tableKey, columns };
  }

  async resetConfig(tableKey: string, context: AccessContext) {
    await this.prisma.tableColumnConfig.deleteMany({
      where: { userId: context.sub, tableKey },
    });
    return { tableKey, columns: null };
  }
}
