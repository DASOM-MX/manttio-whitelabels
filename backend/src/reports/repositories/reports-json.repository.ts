/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { ReportsRepository } from './reports.repository';
import { Report } from '../entities/report.entity';
import { CreateReportDto } from '../dto/create-report.dto';
import { v4 as uuid } from 'uuid';

@Injectable()
export class ReportsJsonRepository implements ReportsRepository {
    private reports: Report[] = [];

    async findAll(): Promise<Report[]> {
        return this.reports;
    }

    async findByUser(userId: string): Promise<Report[]> {
        return this.reports.filter(r => r.user_id === userId);
    }

    async create(dto: CreateReportDto): Promise<Report> {
        const report: Report = {
            id: uuid(), manttio_type: dto.manttio_type, date_arrival: dto.date_arrival, date_departure: dto.date_departure, user_id: dto.user_id,
            is_operating: dto.is_operating, remote_working: dto.remote_working, amperage: dto.amperage, filter: dto.filter, inner_voltage: dto.inner_voltage,
            unusual_noise: dto.unusual_noise, observations: dto.observations, pictures: dto.pictures
        };
        this.reports.push(report);
        return report;
    }
}