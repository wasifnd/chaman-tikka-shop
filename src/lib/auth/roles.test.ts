import { describe, expect, it } from 'vitest';
import { STAFF_ROLES, isRole, isStaffRole, requiredRoles, safeNextPath } from './roles';

describe('requiredRoles', () => {
  it('limits /admin to admins', () => {
    expect(requiredRoles('/admin/orders')).toEqual(['ADMIN', 'SUPER_ADMIN']);
    expect(requiredRoles('/admin')).toEqual(['ADMIN', 'SUPER_ADMIN']);
  });

  it('lets staff and admins into /store', () => {
    expect(requiredRoles('/store/kitchen')).toContain('STORE_STAFF');
    expect(requiredRoles('/store/kitchen')).toContain('ADMIN');
    expect(requiredRoles('/store/kitchen')).not.toContain('CUSTOMER');
  });

  it('requires any signed-in user for /account', () => {
    expect(requiredRoles('/account/orders')).toContain('CUSTOMER');
  });

  it('treats other paths as public and does not match lookalike prefixes', () => {
    expect(requiredRoles('/menu')).toBeNull();
    expect(requiredRoles('/administrator')).toBeNull();
    expect(requiredRoles('/stores')).toBeNull();
  });
});

describe('isRole', () => {
  it('accepts known roles only', () => {
    expect(isRole('ADMIN')).toBe(true);
    expect(isRole('ROOT')).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/account/orders?x=1')).toBe('/account/orders?x=1');
  });

  it('falls back for external, protocol-relative and missing targets', () => {
    expect(safeNextPath('https://evil.com')).toBe('/');
    expect(safeNextPath('//evil.com')).toBe('/');
    expect(safeNextPath('/\\evil.com')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined, '/menu')).toBe('/menu');
  });
});

describe('staff roles', () => {
  it('are store staff and admins, never customers', () => {
    expect([...STAFF_ROLES].sort()).toEqual(['ADMIN', 'STORE_STAFF', 'SUPER_ADMIN']);
    expect(isStaffRole('STORE_STAFF')).toBe(true);
    expect(isStaffRole('ADMIN')).toBe(true);
    expect(isStaffRole('SUPER_ADMIN')).toBe(true);
    expect(isStaffRole('CUSTOMER')).toBe(false);
  });

  it('match who the proxy lets into /store', () => {
    expect(requiredRoles('/store/orders')).toEqual(STAFF_ROLES);
  });
});
