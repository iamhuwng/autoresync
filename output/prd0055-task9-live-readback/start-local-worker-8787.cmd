@echo off
cd /d "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\cloudflare"
"C:\Users\The Lord\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\cloudflare\node_modules\wrangler\bin\wrangler.js" dev --port 8787 --ip 127.0.0.1 --var FIREBASE_DATABASE_EMULATOR_URL:http://127.0.0.1:9000 --var LISTENING_DELIVERY_SECRET:prd0055-local-private-delivery-secret-20260630
