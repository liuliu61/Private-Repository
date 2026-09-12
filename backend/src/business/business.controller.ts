import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessService } from './business.service';
import { CustomerRebatePolicyService } from './customer-rebate-policy.service';
import { SupplierRebatePolicyService } from './supplier-rebate-policy.service';
import { ProcurementOrderService } from './procurement-order.service';
import { PromotionAccountService } from './promotion-account.service';
import { AssignOrganizationDto, BusinessIdParamDto, CreateAccountDto, CreateAdAccountDto, CreateAdSubjectDto, CreateCustomerDto, CreateCustomerPolicyDto, CreateCustomerRebatePolicyVersionDto, CreateFinancialAdjustmentDto, CreateOrganizationDto, CreateProcurementOrderDto, CreatePromotionAccountDto, CreateRefundDto, CreateSettlementDto, CreateSupplierAccountDto, CreateSupplierDto, CreateSupplierPolicyDto, CreateSupplierRebatePolicyVersionDto, CustomerIdParamDto, CustomerPolicyAtQueryDto, CustomerPolicyIdParamDto, CustomerPolicyListQueryDto, FinancialAdjustmentQueryDto, GenerateCustomerSettlementDto, GenerateReconciliationDto, GenerateSupplierSettlementDto, ListQueryDto, PurchaseOrderImportDto, PurchaseOrderQueryDto, RecordCustomerCreditDto, RecordCustomerPaymentDto, RecordSupplierPaymentDto, RefundQueryDto, ReconciliationListQueryDto, ReconciliationQueryDto, SettlementIdParamDto, SettlementQueryDto, SourcingSettingDto, SourcingSettingQueryDto, SupplierIdParamDto, SupplierPolicyIdParamDto, SupplierRebatePolicyListQueryDto, SupplierRebatePolicyQueryDto } from './business.dto';
import { RefundService } from './refund.service';
import { SettlementCenterService } from './settlement-center.service';
import { ReconciliationCenterService } from './reconciliation-center.service';
import { FinancialAdjustmentService } from './financial-adjustment.service';
import { SourcingSettingService } from './sourcing-setting.service';
import { SettlementType } from '@prisma/client';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller()
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(private readonly service: BusinessService, private readonly customerPolicyService: CustomerRebatePolicyService, private readonly supplierPolicyService: SupplierRebatePolicyService, private readonly procurementOrderService: ProcurementOrderService, private readonly promotionAccountService: PromotionAccountService, private readonly refundService: RefundService, private readonly settlementCenterService: SettlementCenterService, private readonly reconciliationCenterService: ReconciliationCenterService, private readonly financialAdjustmentService: FinancialAdjustmentService, private readonly sourcingSettingService: SourcingSettingService) {}
  @Get('organizations') organizations(@Query() q: ListQueryDto, @Req() r: AuthenticatedRequest) { return this.service.listOrganizations(q, r.user); }
  @Post('organizations') createOrganization(@Body() dto: CreateOrganizationDto, @Req() r: AuthenticatedRequest) { return this.service.createOrganization(dto, r.user); }
  @Post('organizations/assign-user') assignOrganization(@Body() dto: AssignOrganizationDto, @Req() r: AuthenticatedRequest) { return this.service.assignOrganization(dto, r.user); }
  @Get('accounts') accounts(@Query() q: ListQueryDto, @Req() r: AuthenticatedRequest) { return this.service.listAccounts(q, r.user); }
  @Post('accounts') createAccount(@Body() dto: CreateAccountDto, @Req() r: AuthenticatedRequest) { return this.service.createAccount(dto, r.user); }
  @Get('customers') customers(@Query() q: ListQueryDto, @Req() r: AuthenticatedRequest) { return this.service.listCustomers(q, r.user); }
  @Post('customers') createCustomer(@Body() dto: CreateCustomerDto, @Req() r: AuthenticatedRequest) { return this.service.createCustomer(dto, r.user); }
  @Get('customers/:customerId/rebate-policy') customerRebatePolicy(@Param() params: CustomerIdParamDto, @Query() query: CustomerPolicyAtQueryDto, @Req() r: AuthenticatedRequest) { return this.customerPolicyService.getCurrent(params.customerId, query, r.user); }
  @Get('customers/:customerId/rebate-policies') customerRebatePolicies(@Param() params: CustomerIdParamDto, @Query() query: CustomerPolicyListQueryDto, @Req() r: AuthenticatedRequest) { return this.customerPolicyService.list(params.customerId, query, r.user); }
  @Post('customers/:customerId/rebate-policies') createCustomerRebatePolicy(@Param() params: CustomerIdParamDto, @Body() dto: CreateCustomerRebatePolicyVersionDto, @Req() r: AuthenticatedRequest) { return this.customerPolicyService.create(params.customerId, dto, r.user); }
  @Post('customers/:customerId/rebate-policies/:id/disable') disableCustomerRebatePolicy(@Param() params: CustomerPolicyIdParamDto, @Req() r: AuthenticatedRequest) { return this.customerPolicyService.disable(params.customerId, params.id, r.user); }
  @Get('suppliers') suppliers(@Query() q: ListQueryDto, @Req() r: AuthenticatedRequest) { return this.service.listSuppliers(q, r.user); }
  @Post('suppliers') createSupplier(@Body() dto: CreateSupplierDto, @Req() r: AuthenticatedRequest) { return this.service.createSupplier(dto, r.user); }
  @Get('suppliers/:supplierId/accounts') supplierAccounts(@Param() params: SupplierIdParamDto, @Req() r: AuthenticatedRequest) { return this.service.listSupplierAccounts(params.supplierId, r.user); }
  @Post('suppliers/:supplierId/accounts') createSupplierAccount(@Param() params: SupplierIdParamDto, @Body() dto: CreateSupplierAccountDto, @Req() r: AuthenticatedRequest) { return this.service.createSupplierAccount(params.supplierId, dto, r.user); }
  @Get('customers/:customerId/promotion-accounts') customerPromotionAccounts(@Param() params: CustomerIdParamDto, @Req() r: AuthenticatedRequest) { return this.promotionAccountService.listCustomerAccounts(params.customerId, r.user); }
  @Post('customers/:customerId/promotion-accounts') createCustomerPromotionAccount(@Param() params: CustomerIdParamDto, @Body() dto: CreatePromotionAccountDto, @Req() r: AuthenticatedRequest) { return this.promotionAccountService.createCustomerAccount(params.customerId, dto, r.user); }
  @Get('suppliers/:supplierId/promotion-accounts') supplierPromotionAccounts(@Param() params: SupplierIdParamDto, @Req() r: AuthenticatedRequest) { return this.promotionAccountService.listSupplierAccounts(params.supplierId, r.user); }
  @Post('suppliers/:supplierId/promotion-accounts') createSupplierPromotionAccount(@Param() params: SupplierIdParamDto, @Body() dto: CreatePromotionAccountDto, @Req() r: AuthenticatedRequest) { return this.promotionAccountService.createSupplierAccount(params.supplierId, dto, r.user); }
  @Get('suppliers/:supplierId/rebate-policy') supplierRebatePolicy(@Param() params: SupplierIdParamDto, @Query() query: SupplierRebatePolicyQueryDto, @Req() r: AuthenticatedRequest) { return this.supplierPolicyService.getCurrent(params.supplierId, query, r.user); }
  @Get('suppliers/:supplierId/rebate-policies') supplierRebatePolicies(@Param() params: SupplierIdParamDto, @Query() query: SupplierRebatePolicyListQueryDto, @Req() r: AuthenticatedRequest) { return this.supplierPolicyService.list(params.supplierId, query, r.user); }
  @Post('suppliers/:supplierId/rebate-policies') createSupplierRebatePolicy(@Param() params: SupplierIdParamDto, @Body() dto: CreateSupplierRebatePolicyVersionDto, @Req() r: AuthenticatedRequest) { return this.supplierPolicyService.create(params.supplierId, dto, r.user); }
  @Post('suppliers/:supplierId/rebate-policies/:id/disable') disableSupplierRebatePolicy(@Param() params: SupplierPolicyIdParamDto, @Req() r: AuthenticatedRequest) { return this.supplierPolicyService.disable(params.supplierId, params.id, r.user); }
  @Get('ad-subjects') adSubjects(@Query() q: ListQueryDto, @Req() r: AuthenticatedRequest) { return this.service.listAdSubjects(q, r.user); }
  @Post('ad-subjects') createAdSubject(@Body() dto: CreateAdSubjectDto, @Req() r: AuthenticatedRequest) { return this.service.createAdSubject(dto, r.user); }
  @Get('ad-accounts') adAccounts(@Query() q: ListQueryDto, @Req() r: AuthenticatedRequest) { return this.service.listAdAccounts(q, r.user); }
  @Post('ad-accounts') createAdAccount(@Body() dto: CreateAdAccountDto, @Req() r: AuthenticatedRequest) { return this.service.createAdAccount(dto, r.user); }
  @Get('purchase-orders') purchaseOrders(@Query() q: PurchaseOrderQueryDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.list(q, r.user); }
  @Post('purchase-orders/import/validate') validatePurchaseOrderImport(@Body() dto: PurchaseOrderImportDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.validateImport(dto, r.user); }
  @Get('purchase-orders/:id/refunds') purchaseOrderRefunds(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.refundService.listByOrder(params.id, r.user); }
  @Get('purchase-orders/:id') purchaseOrder(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.getById(params.id, r.user); }
  @Post('purchase-orders') createPurchaseOrder(@Body() dto: CreateProcurementOrderDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.create(dto, r.user); }
  @Get('sourcing/setting') sourcingSetting(@Query() query: SourcingSettingQueryDto, @Req() r: AuthenticatedRequest) { return this.sourcingSettingService.get(query, r.user); }
  @Post('sourcing/setting') updateSourcingSetting(@Query() query: SourcingSettingQueryDto, @Body() dto: SourcingSettingDto, @Req() r: AuthenticatedRequest) { return this.sourcingSettingService.update(query, dto, r.user); }
  @Post('purchase-orders/:id/submit') submitPurchaseOrder(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.submit(params.id, r.user); }
  @Post('purchase-orders/:id/confirm') confirmPurchaseOrder(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.confirm(params.id, r.user); }
  @Post('purchase-orders/:id/customer-payment') recordCustomerPayment(@Param() params: BusinessIdParamDto, @Body() dto: RecordCustomerPaymentDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.recordCustomerPayment(params.id, dto, r.user); }
  @Post('purchase-orders/:id/supplier-payment') recordSupplierPayment(@Param() params: BusinessIdParamDto, @Body() dto: RecordSupplierPaymentDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.recordSupplierPayment(params.id, dto, r.user); }
  @Post('purchase-orders/:id/customer-credit') recordCustomerCredit(@Param() params: BusinessIdParamDto, @Body() dto: RecordCustomerCreditDto, @Req() r: AuthenticatedRequest) { return this.promotionAccountService.recordCustomerCredit(params.id, dto, r.user); }
  @Post('purchase-orders/:id/cancel') cancelPurchaseOrder(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.cancel(params.id, r.user); }
  @Post('purchase-orders/:id/settle') settlePurchaseOrder(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.procurementOrderService.settle(params.id, r.user); }
  @Post('purchase-orders/:id/refunds') createRefund(@Param() params: BusinessIdParamDto, @Body() dto: CreateRefundDto, @Req() r: AuthenticatedRequest) { return this.refundService.create(params.id, dto, r.user); }
  @Get('refunds') refunds(@Query() q: RefundQueryDto, @Req() r: AuthenticatedRequest) { return this.refundService.list(q, r.user); }
  @Get('refunds/:id') refund(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.refundService.getById(params.id, r.user); }
  @Post('refunds/:id/approve') approveRefund(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.refundService.approve(params.id, r.user); }
  @Post('refunds/:id/reject') rejectRefund(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.refundService.reject(params.id, r.user); }
  @Post('refunds/:id/execute') executeRefund(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.refundService.execute(params.id, r.user); }
  @Get('customer-settlements') customerSettlements(@Query() q: SettlementQueryDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.list(SettlementType.CUSTOMER, q, r.user); }
  @Get('customer-settlements/:id') customerSettlement(@Param() params: SettlementIdParamDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.getById(SettlementType.CUSTOMER, params.id, r.user); }
  @Post('customer-settlements/generate') generateCustomerSettlement(@Body() dto: GenerateCustomerSettlementDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.generateCustomer(dto, r.user); }
  @Post('customer-settlements/:id/confirm') confirmCustomerSettlement(@Param() params: SettlementIdParamDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.confirm(SettlementType.CUSTOMER, params.id, r.user); }
  @Post('customer-settlements/:id/cancel') cancelCustomerSettlement(@Param() params: SettlementIdParamDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.cancel(SettlementType.CUSTOMER, params.id, r.user); }
  @Get('supplier-settlements') supplierSettlements(@Query() q: SettlementQueryDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.list(SettlementType.SUPPLIER, q, r.user); }
  @Get('supplier-settlements/:id') supplierSettlement(@Param() params: SettlementIdParamDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.getById(SettlementType.SUPPLIER, params.id, r.user); }
  @Post('supplier-settlements/generate') generateSupplierSettlement(@Body() dto: GenerateSupplierSettlementDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.generateSupplier(dto, r.user); }
  @Post('supplier-settlements/:id/confirm') confirmSupplierSettlement(@Param() params: SettlementIdParamDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.confirm(SettlementType.SUPPLIER, params.id, r.user); }
  @Post('supplier-settlements/:id/cancel') cancelSupplierSettlement(@Param() params: SettlementIdParamDto, @Req() r: AuthenticatedRequest) { return this.settlementCenterService.cancel(SettlementType.SUPPLIER, params.id, r.user); }
  @Get('customer-rebate-policies') customerPolicies(@Req() r: AuthenticatedRequest) { return this.service.listCustomerPolicies(r.user); }
  @Post('customer-rebate-policies') createCustomerPolicy(@Body() dto: CreateCustomerPolicyDto, @Req() r: AuthenticatedRequest) { return this.service.createCustomerPolicy(dto, r.user); }
  @Get('supplier-rebate-policies') supplierPolicies(@Req() r: AuthenticatedRequest) { return this.service.listSupplierPolicies(r.user); }
  @Post('supplier-rebate-policies') createSupplierPolicy(@Body() dto: CreateSupplierPolicyDto, @Req() r: AuthenticatedRequest) { return this.service.createSupplierPolicy(dto, r.user); }
  @Get('settlements') settlements(@Query() q: ListQueryDto, @Req() r: AuthenticatedRequest) { return this.service.listSettlements(q, r.user); }
  @Post('settlements') createSettlement(@Body() dto: CreateSettlementDto, @Req() r: AuthenticatedRequest) { return this.service.createSettlement(dto, r.user); }
  @Post('settlements/:id/confirm') confirmSettlement(@Param('id') id: string, @Req() r: AuthenticatedRequest) { return this.service.confirmSettlement(id, r.user); }
  @Post('reconciliations/preview') previewReconciliation(@Body() dto: ReconciliationQueryDto, @Req() r: AuthenticatedRequest) { return this.service.previewReconciliation(dto, r.user); }
  @Post('reconciliations') createReconciliation(@Body() dto: ReconciliationQueryDto, @Req() r: AuthenticatedRequest) { return this.service.createReconciliation(dto, r.user); }
  @Get('reconciliations') reconciliations(@Query() q: ReconciliationListQueryDto, @Req() r: AuthenticatedRequest) { return this.reconciliationCenterService.list(q, r.user); }
  @Get('reconciliations/:id') reconciliation(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.reconciliationCenterService.getById(params.id, r.user); }
  @Post('reconciliations/generate') generateReconciliation(@Body() dto: GenerateReconciliationDto, @Req() r: AuthenticatedRequest) { return this.reconciliationCenterService.generate(dto, r.user); }
  @Post('reconciliations/:id/check') checkReconciliation(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.reconciliationCenterService.check(params.id, r.user); }
  @Post('reconciliations/:id/confirm') confirmReconciliation(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.reconciliationCenterService.confirm(params.id, r.user); }
  @Post('reconciliations/:id/complete') completeReconciliation(@Param('id') id: string, @Req() r: AuthenticatedRequest) { return this.service.completeReconciliation(id, r.user); }
  @Get('financial-adjustments') financialAdjustments(@Query() q: FinancialAdjustmentQueryDto, @Req() r: AuthenticatedRequest) { return this.financialAdjustmentService.list(q, r.user); }
  @Get('financial-adjustments/:id') financialAdjustment(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.financialAdjustmentService.getById(params.id, r.user); }
  @Post('financial-adjustments') createFinancialAdjustment(@Body() dto: CreateFinancialAdjustmentDto, @Req() r: AuthenticatedRequest) { return this.financialAdjustmentService.create(dto, r.user); }
  @Post('financial-adjustments/:id/approve') approveFinancialAdjustment(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.financialAdjustmentService.approve(params.id, r.user); }
  @Post('financial-adjustments/:id/reject') rejectFinancialAdjustment(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.financialAdjustmentService.reject(params.id, r.user); }
  @Post('financial-adjustments/:id/execute') executeFinancialAdjustment(@Param() params: BusinessIdParamDto, @Req() r: AuthenticatedRequest) { return this.financialAdjustmentService.execute(params.id, r.user); }
  @Get('dashboard') dashboard(@Req() r: AuthenticatedRequest) { return this.service.dashboard(r.user); }
  @Get('audit-logs') auditLogs(@Query() q: ListQueryDto, @Req() r: AuthenticatedRequest) { return this.service.auditLogs(q, r.user); }
}
