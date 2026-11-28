import { DOCUMENT } from '@angular/common';
import { ApplicationRef, inject, Service } from '@angular/core';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { toast } from '@spartan-ng/brain/sonner';
import { concat, filter, first, fromEvent, interval, merge } from 'rxjs';

/** While the app stays open: an installed app rarely starts from scratch. */
const CHECK_EVERY_MS = 60 * 60_000;

/**
 * Offers each new deploy with an "Actualizar" toast. The service worker
 * downloads it in the background; the page only reloads when the user says so,
 * so a half-filled form is never lost.
 */
@Service()
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);
  private readonly document = inject(DOCUMENT);

  start(): void {
    if (!this.sw.isEnabled) return; // ng serve: no service worker

    // The worker checks on its own when the app opens. Also check when it comes
    // back to the foreground and every hour. The interval starts once the app
    // is stable: a pending timer would delay the worker's registration.
    const stable$ = this.appRef.isStable.pipe(first(Boolean));
    const visible$ = fromEvent(this.document, 'visibilitychange').pipe(
      filter(() => this.document.visibilityState === 'visible'),
    );
    merge(concat(stable$, interval(CHECK_EVERY_MS)), visible$).subscribe(() => {
      this.sw.checkForUpdate().catch(() => {}); // no signal: try again later
    });

    this.sw.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() =>
        toast('Hay una versión nueva', {
          id: 'app-update',
          description: 'Actualiza cuando termines lo que estás haciendo.',
          duration: Infinity,
          action: { label: 'Actualizar', onClick: () => this.reload() },
        }),
      );

    // Rare: the cached version broke (e.g. the phone evicted one of its files).
    // Only a reload fixes it, but the user may want to copy what they typed first.
    this.sw.unrecoverable.subscribe(() =>
      toast.error('La app necesita recargarse', {
        id: 'app-reload',
        description: 'Recarga para seguir usándola.',
        duration: Infinity,
        action: { label: 'Recargar', onClick: () => this.reload() },
      }),
    );
  }

  private reload(): void {
    this.document.location.reload();
  }
}
