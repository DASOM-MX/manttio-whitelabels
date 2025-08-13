/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */

export class BaseReportDto {

    manttio_type!: string; // Assuming this is a typo in the original code, it should match manttio_type
    report_type!: 'minisplit' | 'chiller' | 'uma';

    date_arrival!: Date;
    date_departure!: Date;
    user_id!: string;
    client_id!: string;
    pictures!: Array<string>;
    signature!: string;
}