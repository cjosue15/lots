import { HttpErrorResponse } from '@angular/common/http';
import { toast } from '@spartan-ng/brain/sonner';

/** Toast for a failed save: the API's own message for 400/404/409, a generic one otherwise. */
export function showSaveError(error: unknown): void {
  if (error instanceof HttpErrorResponse && [400, 404, 409].includes(error.status)) {
    const message = error.error?.message;
    toast.error(Array.isArray(message) ? message.join('. ') : (message ?? 'Revisa los datos'));
  } else if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
    toast.error('No se pudo guardar. Inténtalo de nuevo.');
  }
}
