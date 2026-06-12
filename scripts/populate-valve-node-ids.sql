-- One-time migration: set productKey + nodeId for real Zigbee thermostat valves
-- Run via: npx drizzle-kit studio → SQL editor, or: sqlite3 <db_path> < scripts/populate-valve-node-ids.sql

UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c13814785ac635' WHERE tuya_device_id = 'bfe8a6fabd4ea18991ivod'; -- Ecomm 5
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c1383be595e19f' WHERE tuya_device_id = 'bf80dcdce67dfb393fzasc'; -- FOTO 1
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c1383db23dff27' WHERE tuya_device_id = 'bf847011d6301fe56cwbwu'; -- Logistyka 2
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c13858ad2b637a' WHERE tuya_device_id = 'bf074913d2a58e3489yan1'; -- Ecomm 4
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c1386c5f9d3f22' WHERE tuya_device_id = 'bf2ac443e0a197eff0kjve'; -- Korytarz 2
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c138893825ac96' WHERE tuya_device_id = 'bfbcca95caddef1bb9wrws'; -- IT 2
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c13898037bf2bb' WHERE tuya_device_id = 'bf2366a05720705cdcwmql'; -- Korytarz 1
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c1387f11461d5d' WHERE tuya_device_id = 'bf1e9f81162bc77d97rh8s'; -- Ecomm 3
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c138ddc7c712ab' WHERE tuya_device_id = 'bf13401abcf112ced7wwk8'; -- Ecomm 1
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c138e614f1c97d' WHERE tuya_device_id = 'bfaad448fdf3f0a0769erh'; -- Ecomm 2
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c138edacb6e87a' WHERE tuya_device_id = 'bf1e3e65697c71b093ghtf'; -- Biuro Handlowe
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c138c10ae93db7' WHERE tuya_device_id = 'bf944e48991abab7a5rxmq'; -- Logistyka 1
UPDATE ".bootstrap-scaffold_device" SET product_key = 'ogx8u5z6', node_id = 'a4c138cab997d55d' WHERE tuya_device_id = 'bf059f12c654681112lskm'; -- IT 1
