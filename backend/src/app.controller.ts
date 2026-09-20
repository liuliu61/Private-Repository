import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  /**
   * 健康检查端点
   * 用于部署时快速判断后端是否正常运行
   * 访问路径：GET /api/health
   */
  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      },
    };
  }
}
