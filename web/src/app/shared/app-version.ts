// Named import: the bundler keeps only this field, not the rest of package.json.
import { version } from '../../../package.json';

/** The app's version (package.json). Raise it with each deploy users should notice. */
export const APP_VERSION = version;
