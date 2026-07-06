import { Routes } from '@angular/router';
import { ModuleStub } from '../shared/components/module-stub/module-stub';

export default [
  { path: '', component: ModuleStub, data: { title: 'Almacén' } },
  { path: 'stock', component: ModuleStub, data: { title: 'Consulta de stock' } },
] satisfies Routes;
