import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import Joi from 'joi';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/database/database.module.js';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppResolver } from './app.resolver.js';
import { ActivitiesModule } from './activities/activities.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CallsModule } from './calls/calls.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SeedModule } from './seed/seed.module.js';
import { StorageModule } from './storage/storage.module.js';
import type { Request, Response } from 'express';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        MONGODB_URI: Joi.string().required(),
        AUTH_JWT_SECRET: Joi.string().min(32).required(),
        PORT: Joi.number().default(4000),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        UPLOAD_DIR: Joi.string().optional(),
        ADMIN_BOOTSTRAP_EMAIL: Joi.string().email().optional(),
        SEED_DEMO_DATA: Joi.string().valid('true', 'false').default('true'),
        WEBRTC_STUN_URLS: Joi.string().optional(),
        WEBRTC_TURN_URLS: Joi.string().allow('').optional(),
        WEBRTC_TURN_SHARED_SECRET: Joi.string().allow('').optional(),
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: 'schema.gql',
      sortSchema: true,
      context: (context: { req: Request; res: Response }) => ({
        req: context.req,
        res: context.res,
      }),
    }),
    DatabaseModule,
    AuthModule,
    ActivitiesModule,
    RealtimeModule,
    CallsModule,
    ConversationsModule,
    StorageModule,
    MessagesModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule {}
