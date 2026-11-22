import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opens a route: the global guard protects every endpoint by default. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
