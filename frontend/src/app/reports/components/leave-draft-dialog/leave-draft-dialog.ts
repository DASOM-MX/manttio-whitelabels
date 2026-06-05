import { Component, model, output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-leave-draft-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule],
  templateUrl: './leave-draft-dialog.html',
})
export class LeaveDraftDialog {
  visible = model(false);
  cancel = output<void>();
  discard = output<void>();
  keep = output<void>();
}
