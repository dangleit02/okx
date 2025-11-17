import { Test, TestingModule } from '@nestjs/testing';
import { SpotController } from './spot.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: SpotController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SpotController],
      providers: [AppService],
    }).compile();

    appController = app.get<SpotController>(SpotController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
