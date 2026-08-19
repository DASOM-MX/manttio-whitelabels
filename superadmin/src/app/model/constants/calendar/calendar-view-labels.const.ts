import { CalendarView } from '../../enums/calendar/calendar-view.enum';

/** What the corner toggle reads per view (owner 2026-08-04): the toggle names
 *  the view you are ON, and clicking it cycles to the next one — the button is
 *  its own legend, which is what the period label it replaced never was. */
export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  [CalendarView.Day]: 'Día',
  [CalendarView.Week]: 'Semana',
  [CalendarView.Month]: 'Mes',
  [CalendarView.Year]: 'Año',
};
