import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { PersonCreatedEvent } from '../../domain/events/person-created';
import { EventPublisher } from '../../domain/ports/event-publisher';

export class EventBridgeEventPublisher implements EventPublisher {
  private readonly client: EventBridgeClient;

  constructor(
    private readonly eventBusName: string,
    client?: EventBridgeClient,
  ) {
    this.client = client ?? new EventBridgeClient({});
  }

  async publish(event: PersonCreatedEvent): Promise<void> {
    const result = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: event.source,
            DetailType: event.detailType,
            Detail: JSON.stringify(event.detail),
          },
        ],
      }),
    );

    if (result.FailedEntryCount && result.FailedEntryCount > 0) {
      throw new Error(`Failed to publish event: ${JSON.stringify(result.Entries)}`);
    }
  }
}
