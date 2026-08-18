import { Component } from '@angular/core';
import { ShareLinksMenu } from '../../components/share-links-menu/share-links-menu';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TodayVisitsCard } from '../../../calendar/components/today-visits-card/today-visits-card';

/** Shell-owned dashboard (02 §4): default landing route for owner/admin/office.
 *  Card-slot regions are filled by other modules from their own plans — first
 *  in: the calendar's "Visitas de hoy" (12 CP-4b); 08's lead-source counts and
 *  future cards register the same way. The header already hosts the
 *  share-links dropdown (utm-params CP-3). */
@Component({
  selector: 'app-dashboard',
  imports: [PageHeader, ShareLinksMenu, TodayVisitsCard],
  templateUrl: './dashboard.html',
})
export class Dashboard {}
