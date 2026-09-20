import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  // CORS 配置：生产环境限制具体域名，开发环境允许所有
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : true; // 未配置时允许所有（兼容现有部署）

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.BACKEND_PORT || 3001);
  const host = process.env.BACKEND_HOST;
  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }

  console.log(`Backend running on port ${port}, CORS: ${JSON.stringify(allowedOrigins)}`);
}
bootstrap();
