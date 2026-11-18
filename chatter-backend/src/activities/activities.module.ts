import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { ActivitiesResolver } from './activities.resolver.js';
import { ActivitiesService } from './activities.service.js';
import {
  UserActivityRecord,
  UserActivitySchema,
} from './schemas/user-activity.schema.js';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserActivityRecord.name, schema: UserActivitySchema },
    ]),
    AuthModule,
  ],
  providers: [ActivitiesService, ActivitiesResolver],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
