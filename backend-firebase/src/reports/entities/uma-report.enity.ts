/* eslint-disable prettier/prettier */
import { BaseReport } from "./base-report.entity";

export interface UmaReport extends BaseReport {
    is_operating: boolean;
    air_band_adjustment: boolean;
    inner_temperature: string;
    outer_temperature: string;
    air_good_quality: boolean;
    inner_voltage: string;
    motor_amperage: string;
    unusual_noise: boolean;
    observations: string;
}