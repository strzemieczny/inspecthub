import type * as ldap from 'ldapjs';

// The library's typings still describe the old errorMessage field. Exercise
// its actual response/error conversion so upgrades cannot silently lose AD codes.
const library = jest.requireActual<{
  LDAPResult: new (options: {
    status: number;
    diagnosticMessage: string;
  }) => unknown;
  getError: (response: unknown) => Error;
  InvalidCredentialsError: typeof ldap.InvalidCredentialsError;
}>('ldapjs');

describe('ldapjs AD diagnostics compatibility', () => {
  it('preserves the AD substatus from the installed library response', () => {
    const response = new library.LDAPResult({
      status: 49,
      diagnosticMessage: 'AD bind rejected, data 775, v4563',
    });
    const error = library.getError(response);
    expect(error).toBeInstanceOf(library.InvalidCredentialsError);
    expect(error.message).toContain('data 775');
  });
});
