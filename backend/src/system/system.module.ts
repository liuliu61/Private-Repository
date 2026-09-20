import { Module } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { DepartmentController } from './department.controller';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { UserManagementService } from './user.service';
import { UserManagementController } from './user.controller';

@Module({
  controllers: [DepartmentController, RoleController, UserManagementController],
  providers: [DepartmentService, RoleService, UserManagementService],
  exports: [DepartmentService, RoleService, UserManagementService],
})
export class SystemModule {}
