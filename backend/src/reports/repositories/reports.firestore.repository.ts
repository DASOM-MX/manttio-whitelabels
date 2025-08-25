/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Injectable } from "@nestjs/common";
import { ReportsRepository } from "./reports.repository";
import { BaseReport } from "../entities/base-report.entity";
import { CreateReportDto } from "../dto/create-report.dto";
import { db } from "../../../libs/firebase/firebase"; // Adjust the import path as necessary
import { BaseReportDto } from "../dto/base-report.dto";
import { MinisplitReportDto } from "../dto/minisplit-report.dto";
import { ChillerReportDto } from "../dto/chiller-report.dto";
import { UmaReport } from "../entities/uma-report.enity";
import { UmaReportDto } from "../dto/uma-report.dto";

@Injectable()
export class ReportFirestoreRepository implements ReportsRepository {
    private collection = db.collection('reports');
    private reports: BaseReport[] = [];

    async findAll(): Promise<Report[]> {
        // Implementation for fetching all reports from Firestore\
        const snapshot = await this.collection.get();
        return snapshot.docs.map(doc => doc.data() as Report);

    }

    async findOne(id: string): Promise<Report | undefined> {
        // Implementation for fetching a report by ID from Firestore
        const doc = await this.collection.doc(id).get();
        return doc.exists ? (doc.data() as Report) : undefined;
    }



    async findByUser(userId: string): Promise<BaseReport[]> {
        // Implementation for fetching reports by user ID from Firestore
        return this.reports.filter(r => r.user_id === userId);
    }

    async create(dto: MinisplitReportDto | ChillerReportDto | UmaReportDto): Promise<BaseReport> {

        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const counterRef = db.collection('counters').doc(`report-${dateStr}`);

        // generate a new unique report number
        const newNumber = await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let lastNumber = 0;
            if (counterDoc.exists) {
                lastNumber = counterDoc.data()?.lastNumber || 0;
            }
            const nextNumber = lastNumber + 1;
            transaction.set(counterRef, { lastNumber: nextNumber }, { merge: true });
            return nextNumber;
        })

        const paddedNumber = String(newNumber).padStart(4, '0');
        const reportId = `R-${dateStr}-${paddedNumber}`;

        //Build the report object(common fields)
        const baseDto = dto as BaseReportDto;

        const baseReport: Partial<BaseReport> = {
            id: reportId,
            report_type: baseDto.report_type,
            manttio_type: baseDto.manttio_type,
            date_arrival: baseDto.date_arrival,
            date_departure: baseDto.date_departure,
            user_id: baseDto.user_id,
            client_id: baseDto.client_id,
            pictures: baseDto.pictures || [],
            signature: baseDto.signature || ''
        };

        let fullReport: BaseReport;

        switch (dto.report_type) {
            case 'minisplit':
                fullReport = {
                    ...baseReport,
                    is_operating: dto.is_operating,
                    remote_working: dto.remote_working,
                    amperage: dto.amperage,
                    filter: dto.filter,
                    inner_voltage: dto.inner_voltage,
                    unusual_noise: dto.unusual_noise,
                    observations: dto.observations

                } as BaseReport;
                break
            case 'chiller':
                fullReport = {
                    ...baseReport,
                    is_operating: dto.is_operating,
                    inner_temperature: dto.inner_temperature,
                    outer_temperature: dto.outer_temperature,
                    inner_voltage: dto.inner_voltage,
                    plc_keys_working: dto.plc_keys_working,
                    motor_amperage: dto.motor_amperage,
                    system_pressure_1: dto.system_pressure_1,
                    system_pressure_2: dto.system_pressure_2,
                    system_pressure_3: dto.system_pressure_3,
                    oil_pressure: dto.oil_pressure,
                    oil_level: dto.oil_level,
                    flux_switch_working: dto.flux_switch_working,
                    unusual_noise: dto.unusual_noise,
                    observations: dto.observations
                } as BaseReport;
                break;
            case 'uma':
                fullReport = {
                    ...baseReport,
                    is_operating: dto.is_operating,
                    air_band_adjustment: dto.air_band_adjustment,
                    inner_temperature: dto.inner_temperature,
                    outer_temperature: dto.outer_temperature,
                    air_good_quality: dto.air_good_quality,
                    inner_voltage: dto.inner_voltage,
                    motor_amperage: dto.motor_amperage,
                    unusual_noise: dto.unusual_noise,
                    observations: dto.observations
                } as BaseReport;
                break;
            default: throw new Error(`Unknown report type`);

        }

        await this.collection.doc(reportId).set(fullReport);
        return fullReport;
    }

    async update(id: string, dto: Partial<BaseReport>): Promise<BaseReport | null> {
        const docRef = this.collection.doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return null;
        }

        await docRef.update(dto);

        const updatedDoc = await docRef.get();
        return updatedDoc.data() as BaseReport;
    }

}