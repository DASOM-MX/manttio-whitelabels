import { Routes } from '@angular/router';
import { ModuleStub } from '../shared/components/module-stub/module-stub';

export default [
  { path: '', component: ModuleStub, data: { title: 'Clientes' } },
  { path: 'leads', component: ModuleStub, data: { title: 'Leads' } },
  { path: 'blacklist', component: ModuleStub, data: { title: 'Lista negra' } },
] satisfies Routes;
