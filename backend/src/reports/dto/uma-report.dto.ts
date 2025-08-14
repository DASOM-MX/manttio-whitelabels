/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
import { BaseReportDto } from './base-report.dto';

export class UmaReportDto extends BaseReportDto {
    declare report_type: 'uma';

    is_operating!: boolean;
    air_band_adjustment!: boolean;
    inner_temperature!: string
    outer_temperature!: string;
    air_good_quality!: boolean;
    inner_voltage!: string;
    motor_amperage!: string;
    unusual_noise!: boolean;
    observations!: string;
}