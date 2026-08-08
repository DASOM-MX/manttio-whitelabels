import { Routes } from '@angular/router';
import { Calendar } from './pages/calendar/calendar';

/** Calendar (12 §3, shipped as 19 CP-3): the week grid is the module's single
 *  page — visits are created and worked through its dialogs, not sub-routes.
 *  VisitsState is root-registered (app.config) since the dashboard's
 *  "Visitas de hoy" card became its second consumer (12 CP-4b). */
export default [{ path: '', component: Calendar }] satisfies Routes;
