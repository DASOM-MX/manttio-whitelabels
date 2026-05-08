/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */

export class CreateReportDto {
    manttio_type!: string;
    date_arrival!: Date;
    date_departure!: Date;
    user_id!: string;
    client_id!: string;
    is_operating!: boolean;
    remote_working!: boolean;
    amperage!: string;
    filter!: boolean;
    inner_voltage!: string;
    unusual_noise!: boolean;
    observations!: string;
    pictures!: Array<string>;
    signature!: string;
}
