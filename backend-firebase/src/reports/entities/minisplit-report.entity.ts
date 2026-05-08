/* eslint-disable prettier/prettier */
import { BaseReport } from "./base-report.entity";

export interface MinisplitReport extends BaseReport {

    is_operating: boolean;
    remote_working: boolean;
    amperage: string;
    filter: boolean;
    inner_voltage: string;
    unusual_noise: boolean;
    observations: string;

}
