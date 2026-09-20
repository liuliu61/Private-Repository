import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = '服务器内部错误';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string | string[]) || message;
        error = (resp.error as string) || error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      // Prisma 已知错误
      if (exception.name === 'PrismaClientKnownRequestError') {
        status = HttpStatus.BAD_REQUEST;
        error = 'Database Error';
        const prismaError = exception as { code?: string; meta?: { target?: string[] } };
        if (prismaError.code === 'P2002') {
          message = `数据已存在: ${prismaError.meta?.target?.join(', ') || '唯一约束冲突'}`;
          status = HttpStatus.CONFLICT;
        } else if (prismaError.code === 'P2025') {
          message = '记录不存在或已被删除';
          status = HttpStatus.NOT_FOUND;
        }
      }
    }

    // 记录错误日志（500 以上记录完整堆栈）
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - ${status} - ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} - ${status} - ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
