import { Component } from '@angular/core';
import { LucideInbox } from '@lucide/angular';

/** Shell-owned dashboard stub (02 §4): default landing route for
 *  owner/admin/office. Card-slot regions below are filled by other modules
 *  from their own plans (08: lead-source counts; 12: today's visits; future
 *  cards register the same way). */
@Component({
  selector: 'app-dashboard',
  imports: [LucideInbox],
  templateUrl: './dashboard.html',
})
export class Dashboard {}
