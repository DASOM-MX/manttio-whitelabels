/* eslint-disable prettier/prettier */
import { Report } from "../entities/report.entity";
import { CreateReportDto } from "../dto/create-report.dto";

export abstract class ReportsRepository {

    abstract findAll(): Promise<Report[]>;
    abstract findByUser(userId: string): Promise<Report[]>;
    abstract create(dto: CreateReportDto): Promise<Report>;
}