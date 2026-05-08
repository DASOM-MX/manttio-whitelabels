/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
// import 'dotenv/config';
// import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
// import fetch from "node-fetch";

// const client = new S3Client({
//     region: "auto",
//     endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
//     credentials: {
//         accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID!,
//         secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!
//     }
// })

// async function testConnection() {

//     try {
//         const res = await client.send(new ListBucketsCommand({}));
//         console.log("Conexión exitosa:", res.Buckets);
//     } catch (err) {
//         console.error("Error al conectar:", err);
//     }
// }

// testConnection().catch(console.error);

//import { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";




import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID!;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const BUCKET_NAME = "manttio-reports";

const client = new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
    },
    forcePathStyle: false,
});

async function testR2() {
    try {
        // NO uses ListBucketsCommand porque no está soportado en R2

        // Listar objetos en bucket
        const listObjects = await client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME }));
        console.log("Objetos encontrados:", listObjects.Contents?.map(o => o.Key));

        // Subir archivo de prueba
        fs.writeFileSync("archivo-prueba.txt", "Hola desde Cloudflare R2 🚀");

        await client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: "archivo-prueba.txt",
            Body: fs.createReadStream("archivo-prueba.txt"),
            ContentType: "text/plain",
        }));

        console.log("Archivo subido con éxito.");
    } catch (err) {
        console.error("Error:", err);
    }
}

testR2();