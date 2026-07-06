import { Component, input, output } from '@angular/core';
import { LucideCircleDot, LucideSend } from '@lucide/angular';

/** Publish control + "unpublished changes" badge (04 §3), shared by both
 *  editors. Draft saves never touch the public site; this is the gate. */
@Component({
  selector: 'app-publish-bar',
  imports: [LucideCircleDot, LucideSend],
  templateUrl: './publish-bar.html',
})
export class PublishBar {
  unpublished = input.required<boolean>();
  busy = input(false);

  publish = output<void>();
}
