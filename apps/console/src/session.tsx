import { createContext, useContext } from 'react';
import type { Org, User } from './api';

export type Session = { user: User; orgs: Org[]; signOut: () => void };
export const SessionCtx = createContext<Session | null>(null);
export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('No session');
  return s;
}
export const isStaff = (u: User) => u.role === 'staff';
export const canPublish = (u: User) => u.role !== 'editor';
