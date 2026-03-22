import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { mockClient } from 'aws-sdk-client-mock';
import { EventBridgeEventPublisher } from '../../../src/infrastructure/adapters/eventbridge-event-publisher';
import { PersonCreatedEvent } from '../../../src/domain/events/person-created';

const ebMock = mockClient(EventBridgeClient);

const EVENT_BUS_NAME = 'test-event-bus';

const event: PersonCreatedEvent = {
  source: 'person-service',
  detailType: 'PersonCreated',
  detail: {
    personId: 'abc-123',
    firstName: 'John',
    lastName: 'Doe',
    phoneNumber: '+31612345678',
    timestamp: '2024-01-15T10:30:00.000Z',
  },
};

describe('EventBridgeEventPublisher', () => {
  let publisher: EventBridgeEventPublisher;

  beforeEach(() => {
    ebMock.reset();
    publisher = new EventBridgeEventPublisher(EVENT_BUS_NAME);
  });

  it('should publish an event to EventBridge with correct parameters', async () => {
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0, Entries: [] });

    await publisher.publish(event);

    const calls = ebMock.commandCalls(PutEventsCommand);
    expect(calls).toHaveLength(1);

    const input = calls[0].args[0].input;
    expect(input.Entries).toHaveLength(1);
    expect(input.Entries![0]).toEqual({
      EventBusName: EVENT_BUS_NAME,
      Source: 'person-service',
      DetailType: 'PersonCreated',
      Detail: JSON.stringify(event.detail),
    });
  });

  it('should throw when EventBridge reports failed entries', async () => {
    ebMock.on(PutEventsCommand).resolves({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InternalError', ErrorMessage: 'Something went wrong' }],
    });

    await expect(publisher.publish(event)).rejects.toThrow('Failed to publish event');
  });

  it('should propagate EventBridge client errors', async () => {
    ebMock.on(PutEventsCommand).rejects(new Error('Network error'));

    await expect(publisher.publish(event)).rejects.toThrow('Network error');
  });
});
