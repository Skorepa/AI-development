import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController],
})
export class ApiKeysModule {}
