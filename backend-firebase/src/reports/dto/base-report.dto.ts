/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */

export class BaseReportDto {

    manttio_type!: string;
    report_type!: 'minisplit' | 'chiller' | 'uma';

    date_arrival!: Date;
    date_departure!: Date;
    user_id!: string;
    client_id!: string;
    pictures!: Array<string>;
    signature!: string;
    signed_by!: string;
    report_status!: boolean;
}