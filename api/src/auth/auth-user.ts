export const APP_ROLES = ['admin', 'employee'] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Identity attached to each authenticated request. */
export interface AuthUser {
  /** Local `User.id` (use it for authorship: createdById, userId). */
  id: string;
  /** Supabase `auth.users.id`. */
  authId: string;
  email: string;
  displayName: string;
  /** From `application_memberships`, never stored locally. */
  role: AppRole;
}
