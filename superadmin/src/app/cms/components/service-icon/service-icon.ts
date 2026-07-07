import { Component, input } from '@angular/core';
import {
  LucideDroplets,
  LucideFan,
  LucideFlame,
  LucideGauge,
  LucidePackage,
  LucideSettings,
  LucideShieldCheck,
  LucideSnowflake,
  LucideThermometer,
  LucideTruck,
  LucideWrench,
  LucideZap,
} from '@lucide/angular';

/** Renders a curated service-icon code (`service-icons.const`) as its lucide
 *  svg — the single place holding the code→directive mapping. Unknown/empty
 *  codes render nothing. */
@Component({
  selector: 'app-service-icon',
  imports: [
    LucideWrench,
    LucideSnowflake,
    LucideThermometer,
    LucideFan,
    LucideFlame,
    LucideDroplets,
    LucideGauge,
    LucideZap,
    LucideSettings,
    LucideTruck,
    LucidePackage,
    LucideShieldCheck,
  ],
  templateUrl: './service-icon.html',
})
export class ServiceIcon {
  icon = input.required<string>();
  svgClass = input('size-4');
}
