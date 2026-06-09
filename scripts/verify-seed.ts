import { createClient } from "@libsql/client";

const c = createClient({ url: process.env.DATABASE_URL! });
const gw = await c.execute(
	'SELECT id, tuya_gateway_id, name FROM ".bootstrap-scaffold_gateway"',
);
const dev = await c.execute(
	'SELECT tuya_device_id, name, device_type FROM ".bootstrap-scaffold_device"',
);
console.log(`Gateways: ${gw.rows.length}`);
for (const r of gw.rows) console.log(" ", r);
console.log(`Devices: ${dev.rows.length}`);
for (const r of dev.rows) console.log(" ", r);
c.close();
process.exit(0);
