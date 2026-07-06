import { Routes } from '@angular/router';
import { ModuleStub } from '../shared/components/module-stub/module-stub';

export default [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: 'home', component: ModuleStub, data: { title: 'CMS — Contenido' } },
  { path: 'clients', component: ModuleStub, data: { title: 'CMS — Clientes' } },
] satisfies Routes;
