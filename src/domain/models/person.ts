export interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  address: Address;
  createdAt: string;
}

/** Input for creating a person — id and createdAt are system-generated */
export type CreatePersonInput = Omit<Person, 'id' | 'createdAt'>;
