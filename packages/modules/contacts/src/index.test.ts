import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const nativeContacts = { isAvailable: vi.fn(), permissionStatus: vi.fn(), requestPermission: vi.fn(), callAsync: vi.fn() };
  return { nativeContacts, createNativeModule: vi.fn(() => nativeContacts) };
});
vi.mock('@stingjs/modules-core', () => ({ createNativeModule: mocks.createNativeModule }));
import { Contacts } from './index.js';

beforeEach(() => { mocks.nativeContacts.permissionStatus.mockReset(); mocks.nativeContacts.requestPermission.mockReset(); mocks.nativeContacts.callAsync.mockReset(); });
describe('Contacts', () => {
  it('uses the shared contacts permission contract', async () => {
    mocks.nativeContacts.permissionStatus.mockReturnValue('denied');
    mocks.nativeContacts.requestPermission.mockResolvedValue('granted');
    expect(Contacts.getPermissionStatus()).toBe('denied');
    await expect(Contacts.requestPermission()).resolves.toBe('granted');
    expect(mocks.nativeContacts.permissionStatus).toHaveBeenCalledWith('contacts');
  });
  it('bounds list requests and preserves picker cancellation', async () => {
    mocks.nativeContacts.callAsync.mockResolvedValueOnce([{ id: '1', givenName: 'Ada', familyName: 'Lovelace', displayName: 'Ada Lovelace', phones: ['123'], emails: [] }]);
    await expect(Contacts.getContacts({ limit: 5000 })).resolves.toHaveLength(1);
    expect(mocks.nativeContacts.callAsync).toHaveBeenCalledWith('getContacts', [1000]);
    mocks.nativeContacts.callAsync.mockResolvedValueOnce(null);
    await expect(Contacts.pickContact()).resolves.toBeNull();
  });
});
