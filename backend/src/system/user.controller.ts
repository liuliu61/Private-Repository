import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { UserManagementService } from './user.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto, AssignRolesDto } from './user.dto';

@Controller('users')
export class UserManagementController {
  constructor(private readonly userService: UserManagementService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.userService.findAll(
      parseInt(page || '1'),
      parseInt(pageSize || '20'),
      keyword,
      departmentId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Put(':id/password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(id, dto);
  }

  @Put(':id/roles')
  assignRoles(@Param('id') id: string, @Body() dto: AssignRolesDto) {
    return this.userService.assignRoles(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
