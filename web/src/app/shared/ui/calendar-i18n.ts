import type { BrnCalendarI18n } from '@spartan-ng/brain/calendar';

/**
 * Calendar texts in Spanish (same as distribution). The package default uses
 * the browser locale, so a browser in English would show "July 2026 · Su Mo".
 */
const WEEKDAYS_SHORT = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const HEADER_FORMAT = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' });

export const calendarI18nEs: Partial<BrnCalendarI18n> = {
  formatWeekdayName: (index) => WEEKDAYS_SHORT[index] ?? '',
  formatHeader: (month, year) => HEADER_FORMAT.format(new Date(year, month)),
  formatMonth: (month) => MONTHS_SHORT[month] ?? '',
  formatYear: (year) => `${year}`,
  labelPrevious: () => 'Ir al mes anterior',
  labelNext: () => 'Ir al mes siguiente',
  labelWeekday: (index) => WEEKDAYS_LONG[index] ?? '',
  firstDayOfWeek: () => 1,
};
