import { Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CustomersState } from '../../../../state/customers/customers.state';
import { AddInteraction, LoadInteractions } from '../../../../state/customers/customers.actions';
import { MANUAL_INTERACTION_TYPES } from '../../../model/constants/interaction/manual-interaction-types.const';
import { INTERACTION_TYPE_LABELS } from '../../../model/constants/interaction/interaction-type-labels.const';
import {
  InteractionRefLabelPipe,
  InteractionRefLinkPipe,
  InteractionTypeIconPipe,
  InteractionTypeLabelPipe,
} from '../../../pipes/interaction.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { errorMessage } from '../../../data/utils';
import type { InteractionType } from '../../../data/dtos/interaction';

/** Activity timeline + composer (08 §2) — mounted in 07's customer-view CRM
 *  slot. Append-only; `system` entries render muted with an outbound link;
 *  quick-contact buttons call `open(type)` so logging the touch is one save
 *  away (never auto-saved — 08 §2.1).
 *
 *  A `system` entry's outbound link covers every ref kind the backend writes —
 *  report, order, quotation, contract — so the client trail is a working index
 *  of everything raised for them, not just their reports. */
@Component({
  selector: 'app-customer-timeline',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SelectModule,
    TextareaModule,
    LucideDynamicIcon,
    InteractionTypeIconPipe,
    InteractionTypeLabelPipe,
    InteractionRefLinkPipe,
    InteractionRefLabelPipe,
    RelativeTimePipe,
  ],
  templateUrl: './customer-timeline.html',
})
export class CustomerTimeline {
  customerId = input.required<string>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected interactions = select(CustomersState.interactions);
  protected total = select(CustomersState.interactionsTotal);
  protected loading = select(CustomersState.interactionsLoading);

  protected hasMore = computed(() => this.interactions().length < this.total());
  protected saving = signal(false);
  private page = signal(1);

  protected typeOptions = MANUAL_INTERACTION_TYPES.map((value) => ({
    value,
    label: INTERACTION_TYPE_LABELS[value],
  }));

  protected form = this.fb.nonNullable.group({
    type: ['note' as Exclude<InteractionType, 'system'>, Validators.required],
    body: ['', Validators.required],
  });

  constructor() {
    // input() is available after construction; defer the first load a tick.
    queueMicrotask(() => this.reload());
  }

  /** Quick-contact bridge (08 §2.1): pre-fills the composer with the channel
   *  and focuses the body — the caller opens the tel/wa/mailto handler. */
  open(type: Exclude<InteractionType, 'system'>): void {
    this.form.patchValue({ type });
    document.getElementById('timeline-body')?.focus();
  }

  reload(): void {
    this.page.set(1);
    this.store.dispatch(new LoadInteractions(this.customerId(), 1));
  }

  protected loadMore(): void {
    const next = this.page() + 1;
    this.page.set(next);
    this.store.dispatch(new LoadInteractions(this.customerId(), next));
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const raw = this.form.getRawValue();
    this.store
      .dispatch(new AddInteraction(this.customerId(), { type: raw.type, body: raw.body.trim() }))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.reset({ type: 'note', body: '' });
        },
        error: (err) => {
          this.saving.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo registrar',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
