import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString({ message: '用户名不能为空' })
  username!: string;

  @IsString({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少需要 6 位' })
  password!: string;
}
