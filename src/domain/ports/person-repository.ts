import { Person } from '../models/person';

export interface PersonRepository {
  save(person: Person): Promise<void>;
}
