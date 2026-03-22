import { buildPersonCreatedEvent } from '../../../src/domain/events/person-created';
import { Person } from '../../../src/domain/models/person';

describe('buildPersonCreatedEvent', () => {
  const person: Person = {
    id: 'abc-123',
    firstName: 'John',
    lastName: 'Doe',
    phoneNumber: '+31612345678',
    address: {
      street: 'Example Street 1',
      city: 'Amsterdam',
      postalCode: '1234AB',
      country: 'Netherlands',
    },
    createdAt: '2024-01-15T10:30:00.000Z',
  };

  it('should set the correct source and detail type', () => {
    const event = buildPersonCreatedEvent(person);

    expect(event.source).toBe('person-service');
    expect(event.detailType).toBe('PersonCreated');
  });

  it('should include person id and name in the event detail', () => {
    const event = buildPersonCreatedEvent(person);

    expect(event.detail.personId).toBe('abc-123');
    expect(event.detail.firstName).toBe('John');
    expect(event.detail.lastName).toBe('Doe');
  });

  it('should include phone number and timestamp in the event detail', () => {
    const event = buildPersonCreatedEvent(person);

    expect(event.detail.phoneNumber).toBe('+31612345678');
    expect(event.detail.timestamp).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should not include address in the event detail (lean event)', () => {
    const event = buildPersonCreatedEvent(person);

    expect(event.detail).not.toHaveProperty('address');
  });
});
