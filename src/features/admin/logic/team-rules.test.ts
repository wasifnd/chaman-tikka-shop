import { describe, expect, it } from 'vitest';
import type { Role } from '@/lib/auth/roles';
import { canAssignRole, canManageMember } from './team-rules';

const person = (role: Role, id = 'x') => ({ id, role });

describe('canManageMember', () => {
  it('never lets anyone change their own account here', () => {
    expect(canManageMember(person('SUPER_ADMIN', 'a'), person('SUPER_ADMIN', 'a'))).toBe('self');
    expect(canManageMember(person('ADMIN', 'a'), person('ADMIN', 'a'))).toBe('self');
  });

  it('lets admins manage store staff', () => {
    expect(canManageMember(person('ADMIN', 'a'), person('STORE_STAFF', 'b'))).toBe('ok');
    expect(canManageMember(person('SUPER_ADMIN', 'a'), person('STORE_STAFF', 'b'))).toBe('ok');
  });

  it('lets only a super admin manage admins', () => {
    expect(canManageMember(person('ADMIN', 'a'), person('ADMIN', 'b'))).toBe('forbidden');
    expect(canManageMember(person('SUPER_ADMIN', 'a'), person('ADMIN', 'b'))).toBe('ok');
  });

  it('protects super admins and customers from this screen', () => {
    expect(canManageMember(person('SUPER_ADMIN', 'a'), person('SUPER_ADMIN', 'b'))).toBe(
      'forbidden',
    );
    expect(canManageMember(person('ADMIN', 'a'), person('CUSTOMER', 'b'))).toBe('forbidden');
  });

  it('gives store staff and customers no management rights', () => {
    expect(canManageMember(person('STORE_STAFF', 'a'), person('STORE_STAFF', 'b'))).toBe(
      'forbidden',
    );
    expect(canManageMember(person('CUSTOMER', 'a'), person('STORE_STAFF', 'b'))).toBe('forbidden');
  });
});

describe('canAssignRole', () => {
  it('lets any admin create store staff but only a super admin create admins', () => {
    expect(canAssignRole(person('ADMIN'), 'STORE_STAFF')).toBe(true);
    expect(canAssignRole(person('ADMIN'), 'ADMIN')).toBe(false);
    expect(canAssignRole(person('SUPER_ADMIN'), 'ADMIN')).toBe(true);
  });
});
