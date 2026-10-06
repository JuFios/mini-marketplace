import { Controller, Get } from '@nestjs/common';

export interface AppStatusResponse {
  service: string;
  status: 'ok';
}

// Placeholder so `npm run dev -w api` serves something; to be replaced by a real health endpoint.
@Controller()
export class AppController {
  @Get()
  getStatus(): AppStatusResponse {
    return { service: 'mini-marketplace-api', status: 'ok' };
  }
}
