/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
// { IsBoolean, IsString } from 'class-validator';
import { BaseReportDto } from './base-report.dto';

export class ChillerReportDto extends BaseReportDto {
    declare report_type: 'chiller';


    is_operating!: boolean;
    inner_temperature!: string;
    outer_temperature!: string;
    inner_voltage!: string;
    plc_keys_working!: boolean;
    motor_amperage!: string;
    system_pressure_1!: string;
    system_pressure_2!: string;
    system_pressure_3!: string;
    oil_pressure!: string;
    oil_level!: string;
    flux_switch_working!: boolean;
    unusual_noise!: boolean;
    observations!: string;


}

