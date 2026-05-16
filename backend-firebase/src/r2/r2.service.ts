/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    ListBucketsCommand,
    HeadBucketCommand,
    PutObjectCommand,
    GetObjectCommand
} from '@aws-sdk/client-s3';

@Injectable()
export class R2Service implements OnModuleInit {
    private readonly logger = new Logger(R2Service.name);
    private readonly s3Client: S3Client;
    private readonly bucketName: string;

    constructor(private configService: ConfigService) {
        // Obtener y validar las credenciales
        const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
        const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
        const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
        const bucketName = this.configService.get<string>('R2_BUCKET_NAME');

        // Validar que todas las credenciales estén presentes
        if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
            const missing: string[] = [];
            if (!accountId) missing.push('R2_ACCOUNT_ID');
            if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
            if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
            if (!bucketName) missing.push('R2_BUCKET_NAME');

            throw new Error(`Faltan variables de entorno para R2: ${missing.join(', ')}`);
        }

        this.bucketName = bucketName;

        // Configuración básica del cliente S3 para R2
        this.s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
            forcePathStyle: true,
        });

        this.logger.log('R2Service inicializado correctamente');
    }

    async onModuleInit() {
        // Probar la conexión al inicializar el módulo
        try {
            await this.testConnection();
            this.logger.log('Conexión inicial a R2 exitosaa');
        } catch (error) {
            this.logger.warn(`Advertencia: No se pudo conectar a R2 durante la inicialización: ${error.message}`);
        }
    }

    // Método para probar la conexión básica
    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const command = new ListBucketsCommand({});
            const response = await this.s3Client.send(command);

            this.logger.log('Conexión a R2 exitosa');
            return {
                success: true,
                message: `Conectado exitosamente. Buckets encontrados: ${response.Buckets?.length || 0}`
            };
        } catch (error) {
            this.logger.error('Error al conectar con R2:', error.message);
            return {
                success: false,
                message: `Error de conexión: ${error.message}`
            };
        }
    }

    // Método para probar acceso al bucket específico
    async testBucketAccess(): Promise<{ success: boolean; message: string }> {
        try {
            const command = new HeadBucketCommand({
                Bucket: this.bucketName
            });

            await this.s3Client.send(command);

            this.logger.log(`Acceso al bucket '${this.bucketName}' confirmado`);
            return {
                success: true,
                message: `Bucket '${this.bucketName}' accesible correctamente`
            };
        } catch (error) {
            this.logger.error(`Error al acceder al bucket '${this.bucketName}':`, error.message);
            return {
                success: false,
                message: `Error de acceso al bucket: ${error.message}`
            };
        }
    }

    // Método para subir archivo
    async uploadFile(key: string, body: Buffer | string, contentType?: string): Promise<{ success: boolean; message: string; key?: string }> {
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: body,
                ContentType: contentType || 'application/octet-stream'
            });

            await this.s3Client.send(command);

            this.logger.log(`Archivo subido exitosamente: ${key}`);
            return {
                success: true,
                message: `Archivo '${key}' subido correctamente`,
                key
            };
        } catch (error) {
            this.logger.error(`Error al subir archivo '${key}':`, error.message);
            return {
                success: false,
                message: `Error en subida: ${error.message}`
            };
        }
    }

    // Método para descargar archivo
    async downloadFile(key: string): Promise<{ success: boolean; message: string; data?: Buffer }> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });

            const response = await this.s3Client.send(command);
            const data = await response.Body?.transformToByteArray();

            this.logger.log(`Archivo descargado exitosamente: ${key}`);
            return {
                success: true,
                message: `Archivo '${key}' descargado correctamente`,
                data: data ? Buffer.from(data) : undefined
            };
        } catch (error) {
            this.logger.error(`Error al descargar archivo '${key}':`, error.message);
            return {
                success: false,
                message: `Error en descarga: ${error.message}`
            };
        }
    }

    // Método para probar subida de archivo de prueba
    async testUpload(): Promise<{ success: boolean; message: string; key?: string }> {
        const testKey = `test-${Date.now()}.txt`;
        const testContent = 'Este es un archivo de prueba para verificar la conexión R2';

        return this.uploadFile(testKey, testContent, 'text/plain');
    }

    // Método para probar descarga de archivo
    async testDownload(key: string): Promise<{ success: boolean; message: string; data?: string }> {
        try {
            const result = await this.downloadFile(key);

            if (!result.success) {
                return {
                    success: false,
                    message: result.message
                };
            }

            const dataString = result.data?.toString('utf-8');
            return {
                success: true,
                message: result.message,
                data: dataString
            };
        } catch (error) {
            this.logger.error(`Error al probar descarga de '${key}':`, error.message);
            return {
                success: false,
                message: `Error en prueba de descarga: ${error.message}`
            };
        }
    }

    // Método integral de prueba
    async runFullTest(): Promise<{
        connection: boolean;
        bucketAccess: boolean;
        upload: boolean;
        download: boolean;
        details: string[];
        uploadedKey?: string;
    }> {
        const details: string[] = [];
        let connection = false;
        let bucketAccess = false;
        let upload = false;
        let download = false;
        let uploadedKey: string | undefined;

        // Prueba de conexión
        this.logger.log('🔄 Probando conexión...');
        const connectionTest = await this.testConnection();
        connection = connectionTest.success;
        details.push(`Conexión: ${connectionTest.message}`);

        if (connection) {
            // Prueba de acceso al bucket
            this.logger.log('🔄 Probando acceso al bucket...');
            const bucketTest = await this.testBucketAccess();
            bucketAccess = bucketTest.success;
            details.push(`Bucket: ${bucketTest.message}`);

            if (bucketAccess) {
                // Prueba de subida
                this.logger.log('🔄 Probando subida de archivo...');
                const uploadTest = await this.testUpload();
                upload = uploadTest.success;
                uploadedKey = uploadTest.key;
                details.push(`Subida: ${uploadTest.message}`);

                if (upload && uploadedKey) {
                    // Prueba de descarga usando el archivo recién subido
                    this.logger.log('🔄 Probando descarga de archivo...');
                    const downloadTest = await this.testDownload(uploadedKey);
                    download = downloadTest.success;
                    details.push(`Descarga: ${downloadTest.message}`);
                }
            }
        }

        const summary = {
            connection,
            bucketAccess,
            upload,
            download,
            details,
            uploadedKey
        };

        this.logger.log('📋 Resumen de pruebas:', JSON.stringify(summary, null, 2));
        return summary;
    }

    // Getter para obtener el nombre del bucket
    getBucketName(): string {
        return this.bucketName;
    }

    // Getter para verificar si el servicio está configurado
    isConfigured(): boolean {
        return !!this.s3Client && !!this.bucketName;
    }
}