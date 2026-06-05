import { Component, input, model, output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { SignatureComponent } from '../signature-pad/signature-pad';
import type { SignedPayload } from '../../../data/dtos/report';

@Component({
  selector: 'app-sign-submit-dialog',
  standalone: true,
  imports: [DialogModule, SignatureComponent],
  templateUrl: './sign-submit-dialog.html',
})
export class SignSubmitDialog {
  visible = model(false);
  /** True while the parent's save request is in flight. Hides the signature pad,
   *  shows a "saving…" spinner + disclaimer, and locks both the X button and the
   *  Escape key so the user can't dismiss the dialog mid-request. */
  loading = input(false);
  signatureChanged = output<SignedPayload | null>();
}
