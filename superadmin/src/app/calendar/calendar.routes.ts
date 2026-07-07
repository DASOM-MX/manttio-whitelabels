import { Routes } from '@angular/router';
import { ModuleStub } from '../shared/components/module-stub/module-stub';

export default [
  { path: '', component: ModuleStub, data: { title: 'Calendario' } },
] satisfies Routes;
