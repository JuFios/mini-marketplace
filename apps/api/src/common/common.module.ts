import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { createValidationPipe } from './pipes/validation.pipe';

// Registered through DI tokens (not `app.useGlobal*`) so any application built from AppModule,
// including the e2e test app, behaves like production without extra setup.
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class CommonModule {}
