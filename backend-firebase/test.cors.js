/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import fetch from "node-fetch";

const urls = [
    "https://cdn.penanevadachillers.com/reports/1755309272714-signature-1755309271196.png", // Firma (la que falla)
    "https://cdn.penanevadachillers.com/reports/1755309271755-por-que-chiller-mejor-aire-acondicionado-industrial.webp" // Imagen que sí funciona
];

// Simulamos el frontend que hace la petición
const ORIGIN = "https://cdn.penanevadachillers.com";

async function testCors(url) {
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Origin": ORIGIN
            }
        });

        console.log(`\n🔎 URL: ${url}`);
        console.log("Status:", res.status);
        console.log("Content-Type:", res.headers.get("content-type"));
        console.log("Access-Control-Allow-Origin:", res.headers.get("access-control-allow-origin"));
    } catch (err) {
        console.error(`❌ Error al probar ${url}:`, err.message);
    }
}

(async () => {
    for (const url of urls) {
        await testCors(url);
    }
})();