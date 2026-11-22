import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';

/** `YYYY-MM-DD` ↔ local-midnight Date (a calendar day, no timezone shift). */
function fromYmd(value: string | null | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

function toYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DISPLAY = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
const EDIT = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Spartan date picker bound to `YYYY-MM-DD` form values (as the API expects). */
@Component({
  selector: 'app-date-field',
  imports: [HlmDatePickerImports],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true },
  ],
  host: { class: 'block', '(focusout)': 'onTouched()' },
  template: `
    <hlm-date-picker
      [date]="date()"
      (dateChange)="select($event)"
      [disabled]="disabled()"
      [minDate]="minDate()"
      [maxDate]="maxDate()"
      [formatDate]="formatDate"
      [autoCloseOnSelect]="true"
      align="start"
    >
      <hlm-date-picker-input
        [inputId]="inputId()"
        placeholder="dd/mm/aaaa"
        [parseDate]="parseDate"
        [formatInputDate]="formatInputDate"
        calendarAriaLabel="Abrir calendario"
        clearAriaLabel="Borrar fecha"
      />
    </hlm-date-picker>
  `,
})
export class DateFieldComponent implements ControlValueAccessor {
  readonly inputId = input.required<string>();
  readonly min = input<string>();
  readonly max = input<string>();

  protected readonly date = signal<Date | undefined>(undefined);
  protected readonly disabled = signal(false);
  protected readonly minDate = computed(() => fromYmd(this.min()));
  protected readonly maxDate = computed(() => fromYmd(this.max()));

  protected readonly formatDate = (date: Date) => DISPLAY.format(date);
  protected readonly formatInputDate = (date: Date) => EDIT.format(date);
  protected readonly parseDate = (value: string): Date | null => {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
    if (!match) return fromYmd(value) ?? null;
    return fromYmd(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`) ?? null;
  };

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.date.set(fromYmd(value));
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected select(value: Date | null): void {
    const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
    this.date.set(date);
    this.onChange(date ? toYmd(date) : '');
    this.onTouched();
  }
}
