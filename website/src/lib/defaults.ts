// Peña Nevada Chillers content — the fallback for every fetch (plan 15 CP-1:
// with no backend configured or reachable, the site renders exactly as before).

import type { Brand, CmsClient, CmsHome } from './types';

export const DEFAULT_BRAND: Brand = {
  name: 'Peña Nevada Chillers',
  slogan: 'Orgullosamente regiomontanos',
  description:
    'Mantenimiento, renta y venta de chillers, HVAC y refrigeración de proceso para plantas, almacenes y líneas productivas del noreste de México. Orgullosamente regiomontanos.',
  logoUrl: '/brand/penanevada-wordmark-light.png',
  isologoUrl: '/brand/penanevada-mark-light.png',
  contact: {
    // No fallback phone: the old env-provided number is gone and a placeholder
    // would render as a live (fake) tel: link — contact rows hide when absent.
    email: 'contacto@penanevadachillers.com',
    address: 'Gral. Plutarco Elías Calles 2403, Guadalupe, Nuevo León 67169',
  },
  social: {
    instagram: 'https://www.instagram.com/penanevadachillers/',
    tiktok: 'https://www.tiktok.com/@pena.nevada.chillers',
  },
  font: {
    body: 'work_sans',
    heading: 'rubik',
  },
};

export const DEFAULT_HOME: CmsHome = {
  title: 'Climatización bajo control para tu',
  description:
    'Mantenimiento, renta y venta de equipos de aire acondicionado, calefacción y refrigeración. Soluciones confiables diseñadas para el clima del norte.',
  service_targets: ['Nave Industrial', 'Fábrica', 'Pista de hielo', 'Negocio', 'Hogar'],
  badges: [
    { heading: 'Clientes', value: '6+' },
    { heading: 'Proyectos', value: '10+' },
    { heading: 'Experiencia', value: '10+', description: 'años' },
  ],
  services_content: {
    eyebrow: 'Servicios',
    title: 'Climatización industrial, sin comprometer la producción',
    description:
      'Especialistas en chillers, HVAC y refrigeración de proceso para plantas, almacenes y líneas productivas del norte. También atendemos proyectos residenciales bajo solicitud.',
  },
  services: [
    {
      title: 'Mantenimiento',
      description:
        'Programas preventivos y correctivos para chillers, manejadoras y sistemas industriales. Minimizamos paros en planta y prolongamos la vida útil de tus equipos.',
      tags: ['Preventivo', 'Correctivo 24/7', 'Industrial + residencial'],
    },
    {
      title: 'Renta',
      description:
        'Chillers portátiles y enfriadores industriales para respaldar tu operación durante paros programados, picos estacionales o montajes temporales.',
      tags: ['Chillers', 'Maniobra e Instalación', 'Mes o Temporada'],
    },
    {
      title: 'Venta',
      description:
        'Proyectos llave en mano: diseño, suministro e instalación de chillers, HVAC y refrigeración de proceso para plantas productivas.',
      tags: ['Ingeniería en sitio', 'Marcas líderes', 'Llave en mano'],
    },
  ],
  service_area: 'Chillers, HVAC y refrigeración de proceso para el noreste de México.',
  contact_cta: {
    title: 'Cotiza tu próximo proyecto de climatización industrial',
    description:
      'Comparte tu requerimiento — tonelaje, aplicación y ubicación — y un especialista te contacta en menos de 24 horas.',
  },
};

export const DEFAULT_CLIENTS: CmsClient[] = [
  {
    name: 'Oriente Sobre Hielo',
    sector: 'Pistas de patinaje sobre hielo',
    logoUrl: '/clients/oriente-sobre-hielo.jpg',
  },
  {
    name: 'FIMEX',
    legal: 'Fluidos Industriales Mexicanos',
    sector: 'Fluidos industriales',
    logoUrl: '/clients/fimex.jpg',
  },
  {
    name: 'Coverpack',
    sector: 'Empaque industrial',
    logoUrl: '/clients/coverpack.png',
  },
  {
    name: 'Ice Dreams',
    sector: 'Pistas de patinaje sobre hielo',
    logoUrl: '/clients/ice-dreams.jpeg',
  },
  {
    name: 'ISSSTE',
    legal: 'Instituto de Seguridad y Servicios Sociales de los Trabajadores del Estado',
    sector: 'Sector salud',
    logoUrl: '/clients/ISSSTE.png',
  },
  {
    name: 'NG Equipos Especializados en Renta',
    sector: 'Renta industrial',
    logoUrl: '/clients/ng-equipos.jpg',
  },
  {
    name: 'Grupo Collado',
    sector: 'Industria del acero',
    logoUrl: '/clients/grupo-collado.png',
  },
];
