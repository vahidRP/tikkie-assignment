import { randomUUID } from 'crypto';
import { Person, CreatePersonInput } from '../../domain/models/person';
import { PersonRepository } from '../../domain/ports/person-repository';
import { EventPublisher } from '../../domain/ports/event-publisher';
import { buildPersonCreatedEvent } from '../../domain/events/person-created';

export class CreatePersonUseCase {
  constructor(
    private readonly repository: PersonRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: CreatePersonInput): Promise<Person> {
    const person: Person = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };

    await this.repository.save(person);
    await this.eventPublisher.publish(buildPersonCreatedEvent(person));

    return person;
  }
}
