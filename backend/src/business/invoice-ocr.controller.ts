import { Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InvoiceOcrService } from './invoice-ocr.service';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoiceOcrController {
  constructor(private readonly service: InvoiceOcrService) {}

  @Post('ocr')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  recognize(@UploadedFile() file: any, @Req() request: AuthenticatedRequest) {
    const invoiceId = typeof request.body?.invoiceId === 'string' ? request.body.invoiceId : undefined;
    return this.service.recognize(file, invoiceId, request.user);
  }
}
