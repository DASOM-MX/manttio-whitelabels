/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Injectable } from "@nestjs/common";
import { ReportsRepository } from "./reports.repository";
import { Report } from "../entities/report.entity";
import { CreateReportDto } from "../dto/create-report.dto";
//import { v4 as uuid } from 'uuid';
import { db } from "../../../libs/firebase/firebase"; // Adjust the import path as necessary

@Injectable()
export class ReportFirestoreRepository implements ReportsRepository {
    private collection = db.collection('reports');
    private reports: Report[] = [];

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



    async findByUser(userId: string): Promise<Report[]> {
        // Implementation for fetching reports by user ID from Firestore
        return this.reports.filter(r => r.user_id === userId);
    }

    async create(dto: CreateReportDto): Promise<Report> {
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const counterRef = db.collection('counters').doc(`report-${dateStr}`);

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

        const report: Report = {
            id: reportId,
            manttio_type: dto.manttio_type,
            date_arrival: dto.date_arrival,
            date_departure: dto.date_departure,
            user_id: dto.user_id,
            client_id: dto.client_id,
            is_operating: dto.is_operating,
            remote_working: dto.remote_working,
            amperage: dto.amperage,
            filter: dto.filter,
            inner_voltage: dto.inner_voltage,
            unusual_noise: dto.unusual_noise,
            observations: dto.observations,
            pictures: dto.pictures,
            signature: dto.signature
        };
        await this.collection.doc(report.id).set(report);
        //this.reports.push(report);
        // Implementation for saving the report to Firestore
        return report;
    }
}