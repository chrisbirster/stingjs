import { createNativeModule, type NativePermissionStatus } from '@stingjs/modules-core';

const nativeContacts = createNativeModule('Contacts');
const CONTACTS_PERMISSION = 'contacts';

export type ContactsPermissionStatus = NativePermissionStatus;
export interface Contact {
  id: string;
  givenName: string;
  familyName: string;
  displayName: string;
  phones: string[];
  emails: string[];
}

function normalizeContact(value: unknown): Contact {
  if (!value || typeof value !== 'object') throw new TypeError('Contacts returned an invalid contact.');
  const record = value as Record<string, unknown>;
  const strings = (candidate: unknown): string[] => Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === 'string') : [];
  return {
    id: typeof record.id === 'string' ? record.id : '',
    givenName: typeof record.givenName === 'string' ? record.givenName : '',
    familyName: typeof record.familyName === 'string' ? record.familyName : '',
    displayName: typeof record.displayName === 'string' ? record.displayName : '',
    phones: strings(record.phones),
    emails: strings(record.emails),
  };
}

export const Contacts = {
  isAvailable(): boolean { return nativeContacts.isAvailable(); },
  getPermissionStatus(): ContactsPermissionStatus { return nativeContacts.permissionStatus(CONTACTS_PERMISSION); },
  requestPermission(): Promise<ContactsPermissionStatus> { return nativeContacts.requestPermission(CONTACTS_PERMISSION); },
  async getContacts(options: { limit?: number } = {}): Promise<Contact[]> {
    const limit = Math.max(1, Math.min(1000, Math.trunc(options.limit ?? 100)));
    const value = await nativeContacts.callAsync('getContacts', [limit]);
    if (!Array.isArray(value)) throw new TypeError('Contacts returned an invalid contact list.');
    return value.map(normalizeContact);
  },
  async pickContact(): Promise<Contact | null> {
    const value = await nativeContacts.callAsync('pickContact');
    return value == null ? null : normalizeContact(value);
  },
};
