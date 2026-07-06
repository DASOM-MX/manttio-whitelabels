import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LucideHardHat } from '@lucide/angular';

/** Placeholder page for module areas whose plans haven't been implemented
 *  yet (02 CP-3: lazy route stubs). Reads its heading from route data. */
@Component({
  selector: 'app-module-stub',
  imports: [LucideHardHat],
  templateUrl: './module-stub.html',
})
export class ModuleStub {
  private route = inject(ActivatedRoute);
  protected title: string = this.route.snapshot.data['title'] ?? 'Módulo';
}
