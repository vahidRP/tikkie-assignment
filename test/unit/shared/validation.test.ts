import { createPersonSchema } from '../../../src/shared/validation';

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

describe('createPersonSchema', () => {
  it('should accept a valid person input', () => {
    const result = createPersonSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject when firstName is missing', () => {
    const result = createPersonSchema.safeParse({ ...validInput, firstName: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.firstName).toBeDefined();
    }
  });

  it('should reject when lastName is missing', () => {
    const result = createPersonSchema.safeParse({ ...validInput, lastName: '' });
    expect(result.success).toBe(false);
  });

  it('should reject when phoneNumber is missing', () => {
    const result = createPersonSchema.safeParse({ ...validInput, phoneNumber: '' });
    expect(result.success).toBe(false);
  });

  it('should reject an invalid phone number format', () => {
    const result = createPersonSchema.safeParse({ ...validInput, phoneNumber: '12345' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.phoneNumber?.[0]).toContain('E.164');
    }
  });

  it('should accept phone numbers with + prefix in E.164 format', () => {
    const numbers = ['+14155552671', '+31612345678', '+442071234567'];
    for (const phoneNumber of numbers) {
      const result = createPersonSchema.safeParse({ ...validInput, phoneNumber });
      expect(result.success).toBe(true);
    }
  });

  it('should reject phone numbers without + prefix', () => {
    const result = createPersonSchema.safeParse({ ...validInput, phoneNumber: '31612345678' });
    expect(result.success).toBe(false);
  });

  it('should reject when address is missing', () => {
    const { address: _address, ...withoutAddress } = validInput;
    const result = createPersonSchema.safeParse(withoutAddress);
    expect(result.success).toBe(false);
  });

  it('should reject when address fields are missing', () => {
    const result = createPersonSchema.safeParse({
      ...validInput,
      address: { street: '', city: '', postalCode: '', country: '' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const addressIssues = result.error.issues.filter((i) => i.path[0] === 'address');
      expect(addressIssues.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('should reject when address is partially missing', () => {
    const result = createPersonSchema.safeParse({
      ...validInput,
      address: { street: 'Some street' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject completely empty input', () => {
    const result = createPersonSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(4);
    }
  });
});
