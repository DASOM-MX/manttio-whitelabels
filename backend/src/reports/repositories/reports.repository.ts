/* eslint-disable prettier/prettier */
//import { CreateReportDto } from "../dto/create-report.dto";
import { BaseReportDto } from "../dto/base-report.dto";
import { BaseReport } from "../entities/base-report.entity";

export abstract class ReportsRepository {

    abstract findAll(): Promise<Report[]>;
    abstract findByUser(userId: string): Promise<BaseReport[]>;
    abstract create(dto: BaseReportDto): Promise<BaseReport>;
    abstract findOne(id: string): Promise<Report | undefined>;
    abstract update(id: string, dto: Partial<BaseReport>): Promise<BaseReport | null>
}