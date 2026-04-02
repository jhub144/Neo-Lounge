---
description: Start all Neo-Lounge services (API on 3000, Kiosk on 3001, Tablet on 3002, PWA on 3003)
---

# Start Neo-Lounge Services

// turbo-all

1. Kill any processes on ports 3000, 3001, 3002, 3003 using `fuser` (catches child processes reliably):

```bash
for port in 3000 3001 3002 3003; do fuser -k $port/tcp > /dev/null 2>&1; done; sleep 2; echo "Ports cleared"
```

2. Double-check ports are free — force-kill anything still hanging on:

```bash
for port in 3000 3001 3002 3003; do fuser $port/tcp > /dev/null 2>&1 && fuser -k -9 $port/tcp > /dev/null 2>&1; done; sleep 1; echo "Ports confirmed free"
```

3. Start the API server (port 3000):

```bash
cd ~/devprojects/Neo-Lounge/apps/api && npm run dev &
```

4. Start the Kiosk app (port 3001 — configured in package.json):

```bash
cd ~/devprojects/Neo-Lounge/apps/kiosk && npm run dev &
```

5. Start the Tablet app (port 3002 — configured in package.json):

```bash
cd ~/devprojects/Neo-Lounge/apps/tablet && npm run dev &
```

6. Start the Customer Replay PWA (port 3003 — configured in package.json):

```bash
cd ~/devprojects/Neo-Lounge/apps/pwa && npm run dev &
```

7. Wait for services to come up and verify all four ports are listening:

```bash
sleep 5 && for port in 3000 3001 3002 3003; do echo -n "Port $port: "; fuser $port/tcp > /dev/null 2>&1 && echo "✅ running" || echo "❌ not running"; done
```
