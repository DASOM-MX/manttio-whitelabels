import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { VisitsState } from '../../state/visits/visits.state';
import { Calendar } from './pages/calendar/calendar';

/** Calendar (12 §3, shipped as 19 CP-3): the week grid is the module's single
 *  page — visits are created and worked through its dialogs, not sub-routes. */
export default [
  { path: '', providers: [provideStates([VisitsState])], component: Calendar },
] satisfies Routes;
