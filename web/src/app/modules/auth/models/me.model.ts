export type AppRole = 'admin' | 'employee';

/** Response of `GET /me`. */
export interface Me {
  id: string;
  authId: string;
  email: string;
  displayName: string;
  role: AppRole;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  employee: 'Ingeniero',
};
