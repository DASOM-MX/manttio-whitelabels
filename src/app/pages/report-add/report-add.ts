import { Component } from '@angular/core';
import { FieldConfig } from '../../shared/dynamic-form/models/field-config.model';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';

@Component({
  selector: 'app-report-add',
  standalone: true,
  imports: [DynamicForm],
  templateUrl: './report-add.html',
  styleUrl: './report-add.scss'
})
export class ReportAdd {

  formFields: FieldConfig[] = [
    {
      type: 'text',
      label: 'Para',
      name: 'para',
      defaultValue: ''
    },
    {
      type: 'text',
      label: 'Tipo de tarea',
      name: 'tipoTarea',
      defaultValue: 'Mantenimiento Preventivo'
    },
    {
      type: 'datetime-local',
      label: 'Fecha de llegada',
      name: 'fechaLlegada',
      defaultValue: ''
    },
    {
      type: 'datetime-local',
      label: 'Fecha de salida',
      name: 'fechaSalida',
      defaultValue: ''
    },
    {
      type: 'select',
      label: '¿Equipo se encuentra operando?',
      name: 'equipoOperando',
      defaultValue: '',
      options: ['Sí', 'No']
    },
    {
      type: 'select',
      label: '¿Control remoto funciona?',
      name: 'controlRemoto',
      defaultValue: '',
      options: ['Sí', 'No']
    },
    {
      type: 'number',
      label: 'Amperaje general',
      name: 'amperaje',
      defaultValue: ''
    },
    {
      type: 'select',
      label: '¿Cuenta con filtro de evaporador?',
      name: 'filtroEvaporador',
      defaultValue: '',
      options: ['Sí', 'No']
    },
    {
      type: 'number',
      label: 'Voltaje de entrada',
      name: 'voltajeEntrada',
      defaultValue: ''
    },
    {
      type: 'select',
      label: '¿Ruido fuera de lo normal?',
      name: 'ruidoAnormal',
      defaultValue: '',
      options: ['Sí', 'No']
    },
    {
      type: 'text',
      label: 'Observaciones',
      name: 'observaciones',
      defaultValue: ''
    },
    {
      type: 'image',
      label: 'Foto 1',
      name: 'foto1',
      defaultValue: ''
    }
  ];

}
