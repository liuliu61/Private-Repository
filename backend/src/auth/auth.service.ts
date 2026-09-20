import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const roles = user.userRoles.map((item) => item.role.code);
    const permissions = user.userRoles.flatMap((item) => item.role.permissions.map((item) => item.permission.code));
    const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username, roles, permissions });
    return { accessToken, user: { id: user.id, username: user.username, displayName: user.displayName, roles, permissions } };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    if (!(await bcrypt.compare(oldPassword, user.passwordHash))) {
      throw new BadRequestException('旧密码错误');
    }
    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能与旧密码相同');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { success: true, message: '密码修改成功' };
  }
}
