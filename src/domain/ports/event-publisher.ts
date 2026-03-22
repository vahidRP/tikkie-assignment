import { PersonCreatedEvent } from '../events/person-created';

export interface EventPublisher {
  publish(event: PersonCreatedEvent): Promise<void>;
}
