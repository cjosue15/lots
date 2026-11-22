import { Component, inject } from '@angular/core';
import { AuthService } from '../../../auth/services/auth.service';

/** Placeholder until the lots overview is built (stage 4). */
@Component({
  selector: 'app-overview',
  template: `
    <h1 class="text-[1.75rem] leading-tight font-semibold">Hola, {{ auth.me()?.displayName }}</h1>
    <p class="mt-2 text-muted-foreground">Aquí verás el estado de cada lote.</p>
  `,
})
export class OverviewComponent {
  protected readonly auth = inject(AuthService);
}
