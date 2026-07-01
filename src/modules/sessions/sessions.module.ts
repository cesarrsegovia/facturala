import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './session.entity';
import { SessionsService } from './sessions.service';
import { SessionsCron } from './sessions.cron';

@Module({
  imports: [TypeOrmModule.forFeature([Session])],
  providers: [SessionsService, SessionsCron],
  exports: [SessionsService],
})
export class SessionsModule {}
