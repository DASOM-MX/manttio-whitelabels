/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
//import { IsBoolean, IsString } from 'class-validator';
import { BaseReportDto } from './base-report.dto';


export class MinisplitReportDto extends BaseReportDto {
    declare report_type: 'minisplit';


    is_operating!: boolean;


    remote_working!: boolean;


    amperage!: string;


    filter!: boolean;


    inner_voltage!: string;


    unusual_noise!: boolean;


    observations!: string;
}