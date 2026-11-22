import { SetMetadata } from '@nestjs/common';
import type { AppRole } from '../auth-user.js';

export const ROLES_KEY = 'roles';

/** Restricts a route (or controller) to the given roles, e.g. `@Roles('admin')`. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
