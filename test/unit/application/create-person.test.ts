import { CreatePersonUseCase } from '../../../src/application/use-cases/create-person';
import { PersonRepository } from '../../../src/domain/ports/person-repository';
import { EventPublisher } from '../../../src/domain/ports/event-publisher';
import { Person } from '../../../src/domain/models/person';

describe('CreatePersonUseCase', () => {
  const mockRepository: jest.Mocked<PersonRepository> = {
    save: jest.fn(),
  };

  const mockEventPublisher: jest.Mocked<EventPublisher> = {
    publish: jest.fn(),
  };

  const useCase = new CreatePersonUseCase(mockRepository, mockEventPublisher);

  const validInput = {
    firstName: 'John',
    lastName: 'Doe',
    phoneNumber: '+31612345678',
    address: {
      street: 'Example Street 1',
      city: 'Amsterdam',
      postalCode: '1234AB',
      country: 'Netherlands',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a person with a generated id and createdAt', async () => {
    const person = await useCase.execute(validInput);

    expect(person.id).toBeDefined();
    expect(person.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(person.createdAt).toBeDefined();
    expect(new Date(person.createdAt).toISOString()).toBe(person.createdAt);
  });

  it('should persist the input fields on the created person', async () => {
    const person = await useCase.execute(validInput);

    expect(person.firstName).toBe('John');
    expect(person.lastName).toBe('Doe');
    expect(person.phoneNumber).toBe('+31612345678');
    expect(person.address).toEqual(validInput.address);
  });

  it('should save the person to the repository', async () => {
    const person = await useCase.execute(validInput);

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    expect(mockRepository.save).toHaveBeenCalledWith(person);
  });

  it('should publish a PersonCreated event after saving', async () => {
    const person = await useCase.execute(validInput);

    expect(mockEventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(mockEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'person-service',
        detailType: 'PersonCreated',
        detail: expect.objectContaining({
          personId: person.id,
          firstName: 'John',
          lastName: 'Doe',
        }),
      }),
    );
  });

  it('should propagate repository errors', async () => {
    mockRepository.save.mockRejectedValueOnce(new Error('DynamoDB failure'));

    await expect(useCase.execute(validInput)).rejects.toThrow('DynamoDB failure');
    expect(mockEventPublisher.publish).not.toHaveBeenCalled();
  });

  it('should propagate event publisher errors', async () => {
    mockEventPublisher.publish.mockRejectedValueOnce(new Error('EventBridge failure'));

    await expect(useCase.execute(validInput)).rejects.toThrow('EventBridge failure');
  });

  it('should generate unique ids for each person', async () => {
    const person1 = await useCase.execute(validInput);
    const person2 = await useCase.execute(validInput);

    expect(person1.id).not.toBe(person2.id);
  });
});
