import { Component } from '@angular/core';
import { APP_VERSION } from '../app-version';
import { todayInPeru } from '../peru-date';

/** Copyright line with the app's version, at the bottom of every screen. */
@Component({
  selector: 'app-footer',
  host: { class: 'block px-4 pt-2 pb-4 text-center text-xs text-muted-foreground' },
  template: `<footer>© {{ year }} Invernadero Oro Verde. Derechos reservados — v{{ version }}</footer>`,
})
export class AppFooterComponent {
  protected readonly version = APP_VERSION;
  protected readonly year = todayInPeru().slice(0, 4);
}
