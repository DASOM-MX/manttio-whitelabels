/* eslint-disable prettier/prettier */
export interface BaseReport {
    id: string;
    manttio_type: string;
    report_type: string;
    date_arrival: Date;
    date_departure: Date;
    user_id: string;
    client_id: string;
    pictures: Array<string>;
    signature: string;
    signed_by: string;
    report_status: boolean;
}