# Colour Prediction Arena — Final Node 24 Build

## Important
This build is for **virtual points only**. It contains no real-money deposits, withdrawals, payment processing, or cash wagering.

## Run on Node.js 24

Open PowerShell in this folder:

```powershell
npm install
npm start
```

Then open:

http://localhost:3000

## If an old copy is running
Stop it with `Ctrl+C`, then run the commands above from THIS folder.

## Multiplayer on the same Wi-Fi

On the PC run:

```powershell
ipconfig
```

Find the IPv4 address, then on the phone open:

```text
http://YOUR-PC-IP:3000
```

Example:

```text
http://192.168.1.5:3000
```

## Data
Accounts and predictions are stored in `data.json`. This avoids native SQLite modules and therefore avoids the `better-sqlite3`, `node-gyp`, and Visual Studio build-tool problems.
