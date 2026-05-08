/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
//import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import * as dotenv from 'dotenv';
dotenv.config();
import { getFirestore } from 'firebase-admin/firestore';
//const serviceAccount = require('../manttio-firebase-adminsdk-fbsvc-c232958ac5.json');
import * as admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS!);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

export const db = getFirestore();
