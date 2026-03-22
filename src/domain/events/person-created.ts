import { Person } from '../models/person';

export interface PersonCreatedEvent {
  source: string;
  detailType: string;
  detail: {
    personId: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    timestamp: string;
  };
}

const EVENT_SOURCE = 'person-service';
const EVENT_DETAIL_TYPE = 'PersonCreated';

export function buildPersonCreatedEvent(person: Person): PersonCreatedEvent {
  return {
    source: EVENT_SOURCE,
    detailType: EVENT_DETAIL_TYPE,
    detail: {
      personId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      phoneNumber: person.phoneNumber,
      timestamp: person.createdAt,
    },
  };
}
