// Brand-neutral fallback content — used when no backend is configured or
// reachable (plan 15 CP-1). Tenant identity (name, logos, contact, clients)
// always comes from the brand/CMS API; these defaults only keep the template
// rendering with generic industry copy.

import type { Brand, CmsClient, CmsHome, CmsSectionContent } from './types';

export const DEFAULT_BRAND: Brand = {
  name: 'Climatización Industrial',
  description:
    'Mantenimiento, renta y venta de chillers, HVAC y refrigeración de proceso para plantas, almacenes y líneas productivas.',
  // No fallback logos, contact, or socials: those are tenant identity — the
  // header/footer/contact rows hide when absent (a placeholder would render
  // as live-looking but fake links).
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
  service_area: 'Chillers, HVAC y refrigeración de proceso.',
  contact_cta: {
    title: 'Cotiza tu próximo proyecto de climatización industrial',
    description:
      'Comparte tu requerimiento — tonelaje, aplicación y ubicación — y un especialista te contacta en menos de 24 horas.',
  },
};

// Client roster is tenant content (cms_clients) — no fallback wall; the
// Clientes section hides entirely when the CMS has nothing published.
export const DEFAULT_CLIENTS: CmsClient[] = [];

// Fallback copy for the published service catalog (18 §4), used when the tenant
// leaves `cms_home.catalog_content` blank — same posture as every other v1.1
// section group. The *entries* are always tenant-owned (the service catalog);
// only this heading has a brand-neutral default.
export const DEFAULT_CATALOG_CONTENT: CmsSectionContent = {
  eyebrow: 'Catálogo',
  title: 'Servicios y precios de referencia',
  description:
    'El detalle de lo que ofrecemos, con su unidad de cobro. Los precios son de referencia y no incluyen IVA; cada proyecto se cotiza según alcance, ubicación y condiciones de sitio.',
};
