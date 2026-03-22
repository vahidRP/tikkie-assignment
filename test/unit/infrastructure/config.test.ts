import { getConfig } from '../../../src/infrastructure/config';

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return config when all env vars are set', () => {
    process.env.TABLE_NAME = 'my-table';
    process.env.EVENT_BUS_NAME = 'my-bus';

    const config = getConfig();

    expect(config).toEqual({
      tableName: 'my-table',
      eventBusName: 'my-bus',
    });
  });

  it('should throw when TABLE_NAME is missing', () => {
    delete process.env.TABLE_NAME;
    process.env.EVENT_BUS_NAME = 'my-bus';

    expect(() => getConfig()).toThrow('TABLE_NAME');
  });

  it('should throw when EVENT_BUS_NAME is missing', () => {
    process.env.TABLE_NAME = 'my-table';
    delete process.env.EVENT_BUS_NAME;

    expect(() => getConfig()).toThrow('EVENT_BUS_NAME');
  });
});
