import { IsUUID } from 'class-validator';

export class RebateIdParamDto {
  @IsUUID('4', { message: '返点记录 ID 格式不正确' })
  id!: string;
}
