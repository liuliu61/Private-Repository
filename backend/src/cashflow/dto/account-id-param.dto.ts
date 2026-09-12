import { IsUUID } from 'class-validator';

export class AccountIdParamDto {
  @IsUUID('4', { message: '账户ID格式不正确' })
  id!: string;
}
