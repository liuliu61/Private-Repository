import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortalPayload, PortalService } from './portal.service';

interface AuthenticatedRequest extends Request {
  user?: PortalPayload & { roles?: string[]; permissions?: string[] };
}

@Controller('portal')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  // ==================== 登录（无需守卫） ====================

  @Post('c/login')
  customerLogin(@Body() dto: { username: string; password: string }) {
    return this.service.customerLogin(dto.username, dto.password);
  }

  @Post('b/login')
  agentLogin(@Body() dto: { username: string; password: string }) {
    return this.service.agentLogin(dto.username, dto.password);
  }

  // ==================== C 端（客户） ====================

  @UseGuards(JwtAuthGuard)
  @Get('c/me')
  cMe(@Req() req: AuthenticatedRequest) {
    return this.service.cMe(req.user!);
  }

  @UseGuards(JwtAuthGuard)
  @Get('c/wallets')
  cWallets(@Req() req: AuthenticatedRequest) {
    return this.service.cWallets(req.user!);
  }

  @UseGuards(JwtAuthGuard)
  @Get('c/wallets/:id/transactions')
  cWalletTransactions(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: Record<string, any>) {
    return this.service.cWalletTransactions(req.user!, id, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('c/promotion-accounts')
  cPromotionAccounts(@Req() req: AuthenticatedRequest) {
    return this.service.cPromotionAccounts(req.user!);
  }

  @UseGuards(JwtAuthGuard)
  @Get('c/promotion-accounts/:id/transactions')
  cPromotionAccountTransactions(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: Record<string, any>) {
    return this.service.cPromotionAccountTransactions(req.user!, id, query);
  }

  @UseGuards(JwtAuthGuard)
  @Post('c/recharge-requests')
  cCreateRechargeRequest(@Req() req: AuthenticatedRequest, @Body() dto: { promotionAccountId: string; amount: string; remark?: string }) {
    return this.service.cCreateRechargeRequest(req.user!, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('c/recharge-requests')
  cListRechargeRequests(@Req() req: AuthenticatedRequest, @Query() query: Record<string, any>) {
    return this.service.cListRechargeRequests(req.user!, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('c/invoices')
  cInvoices(@Req() req: AuthenticatedRequest, @Query() query: Record<string, any>) {
    return this.service.cInvoices(req.user!, query);
  }

  // ==================== B 端（一级代理） ====================

  @UseGuards(JwtAuthGuard)
  @Get('b/me')
  bMe(@Req() req: AuthenticatedRequest) {
    return this.service.bMe(req.user!);
  }

  @UseGuards(JwtAuthGuard)
  @Get('b/channels')
  bChannels() {
    return this.service.bChannels();
  }

  @UseGuards(JwtAuthGuard)
  @Get('b/customers')
  bCustomers(@Req() req: AuthenticatedRequest, @Query() query: Record<string, any>) {
    return this.service.bCustomers(req.user!, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('b/customers/:id')
  bCustomerDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.bCustomerDetail(req.user!, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('b/recharge-requests')
  bListRechargeRequests(@Req() req: AuthenticatedRequest, @Query() query: Record<string, any>) {
    return this.service.bListRechargeRequests(req.user!, query);
  }

  @UseGuards(JwtAuthGuard)
  @Post('b/recharge-requests/:id/confirm')
  bConfirmRecharge(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: { portId?: string; customerRebate?: string; costRebate?: string; remitAmount?: string; remark?: string }) {
    return this.service.bConfirmRecharge(req.user!.agentUserId!, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('b/recharge-requests/:id/reject')
  bRejectRecharge(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: { reason: string }) {
    return this.service.bRejectRecharge(req.user!.agentUserId!, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('b/transactions')
  bTransactions(@Req() req: AuthenticatedRequest, @Query() query: Record<string, any>) {
    return this.service.bTransactions(req.user!, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('b/invoices')
  bInvoices(@Req() req: AuthenticatedRequest, @Query() query: Record<string, any>) {
    return this.service.bInvoices(req.user!, query);
  }

  // ==================== 管理端（管理员维护门户账号） ====================

  @UseGuards(JwtAuthGuard)
  @Get('admin/customer-users')
  adminListCustomerUsers(@Query() query: Record<string, any>) {
    return this.service.adminListCustomerUsers(query);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/customers/:id/portal-account')
  adminCreateCustomerAccount(@Req() req: AuthenticatedRequest, @Param('id') customerId: string, @Body() dto: { username: string; password: string; displayName?: string; phone?: string }) {
    return this.service.adminCreateCustomerAccount(req.user!, customerId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/customer-users/:id/reset-password')
  adminResetCustomerPassword(@Req() req: AuthenticatedRequest, @Param('id') customerUserId: string, @Body() dto: { password: string }) {
    return this.service.adminResetCustomerPassword(req.user!, customerUserId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/agent-users')
  adminListAgentUsers(@Query() query: Record<string, any>) {
    return this.service.adminListAgentUsers(query);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/agent-users')
  adminCreateAgentUser(@Req() req: AuthenticatedRequest, @Body() dto: { username: string; password: string; displayName: string; phone?: string; remark?: string }) {
    return this.service.adminCreateAgentUser(req.user!, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/agent-users/:id/update')
  adminUpdateAgentUser(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: { displayName?: string; phone?: string; remark?: string; status?: string }) {
    return this.service.adminUpdateAgentUser(req.user!, id, dto as any);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/agent-users/:id/reset-password')
  adminResetAgentPassword(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: { password: string }) {
    return this.service.adminResetAgentPassword(req.user!, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/agent-users/:id/bind-customers')
  adminBindCustomers(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: { customerIds: string[] }) {
    return this.service.adminBindCustomers(req.user!, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/agent-users/:id/unbind-customers/:customerId')
  adminUnbindCustomer(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('customerId') customerId: string) {
    return this.service.adminUnbindCustomer(req.user!, id, customerId);
  }
}
