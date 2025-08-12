/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from "@smithy/node-http-handler";
import sharp from 'sharp';

import * as https from "https";


import { ConfigService } from '@nestjs/config';

import * as dotenv from "dotenv";

dotenv.config();

const httpsAgent = new https.Agent({
    minVersion: "TLSv1.2",
});

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID!;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const BUCKET_NAME = "manttio-reports";



@Injectable()
export class UploadService {
    private s3: S3Client;
    private bucketName = process.env.R2_BUCKET_NAME!;

    constructor(private config: ConfigService) {
        this.s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: ACCESS_KEY,
                secretAccessKey: SECRET_KEY,
            },
            forcePathStyle: true,
            requestHandler: new NodeHttpHandler({
                httpsAgent,
            }),
        });
    }

    async uploadFile(file: Express.Multer.File) {

        const compressedBuffer = await sharp(file.buffer)
            .resize({ width: 1080, withoutEnlargement: true }) // no agranda si es más pequeña
            .jpeg({ quality: 80 }) // calidad del 0 al 100
            .toBuffer();

        const key = `reports/${Date.now()}-${file.originalname}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: compressedBuffer,
            ContentType: file.mimetype,
        });

        await this.s3.send(command);
        return `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${key}`;
    }

    async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
        const urls: string[] = [];
        for (const file of files) {
            const url = await this.uploadFile(file);
            urls.push(url);
        }
        return urls
    }

}

