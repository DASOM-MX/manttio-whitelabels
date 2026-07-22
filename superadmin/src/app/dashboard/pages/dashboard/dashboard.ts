import { Component } from '@angular/core';
import { LucideInbox } from '@lucide/angular';
import { ShareLinksMenu } from '../../components/share-links-menu/share-links-menu';
import { PageHeader } from '../../../shared/components/page-header/page-header';

/** Shell-owned dashboard stub (02 §4): default landing route for
 *  owner/admin/office. Card-slot regions below are filled by other modules
 *  from their own plans (08: lead-source counts; 12: today's visits; future
 *  cards register the same way). The header already hosts the share-links
 *  dropdown (utm-params CP-3). */
@Component({
  selector: 'app-dashboard',
  imports: [LucideInbox, PageHeader, ShareLinksMenu],
  templateUrl: './dashboard.html',
})
export class Dashboard {}
