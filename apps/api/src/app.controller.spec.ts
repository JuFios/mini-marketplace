import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = moduleRef.get(AppController);
  });

  it('reports the service as up', () => {
    expect(controller.getStatus()).toEqual({ service: 'mini-marketplace-api', status: 'ok' });
  });
});
