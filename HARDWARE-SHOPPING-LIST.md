# Neo Lounge — Hardware Shopping List

Everything you need to buy to open the lounge and run the full system.
This list has specific product names and estimated KES prices so an errand runner can go out and purchase everything.

Each section covers one area of the build. Inside each section you'll find:
- **The main items** — the big purchases
- **Cables & connectors** — the small things that connect them

At the very end there's a **Master Cable & Connector Summary** so you can do one single cable shopping run, and a **Contingency Items** section for extras you might need depending on your layout.

> **How to read this:** Each section is self-contained. You can tackle them one at a time.
> Quantities are for **all 4 stations** unless noted otherwise.
> Prices are estimates based on Kenyan market as of April 2026.

---

&nbsp;

---

# SECTION 1 — Gaming Stations

*Buy 4 of everything in this section (one per station).*

&nbsp;

### Main Items (x 4)

| # | What | Specific Model | Est. Price (KES) | Qty |
|---|---|---|---|---|
| 1 | **PS5 console** | PS5 Slim Disc Edition (1TB SSD) — disc edition recommended for physical game longevity | 107,000 | 4 |
| 2 | **PS5 DualSense controller** | PS5 DualSense Wireless Controller | 13,500 | 8 (2 per station) |
| 3 | **PS5 DualSense charging station** | PS5 DualSense Charging Station | 5,000 | 4 |
| 4 | **TV — 50" 4K** | TCL 50" 4K Google TV (P735 or newer P-series) | 49,000 | 4 |
| 5 | **Android tablet (8"–10")** | Lenovo Tab M8 (4th Gen) or Samsung Galaxy Tab A9 | 18,000 | 4 |
| 6 | **Tablet stand or wall mount** | Generic secure wall mount or desk stand | 2,500 | 4 |

&nbsp;

> **TV requirement:** Must be an **Android TV / Google TV** with **ADB over network** enabled.
> The software uses this to switch HDMI inputs automatically.
> The TCL P735 is verified to support Network ADB. Always confirm the TV OS is strictly
> "Android TV" or "Google TV" (not Roku or proprietary OS) before paying.
>
> Other brands that reliably support ADB over WiFi:
> - Sony Bravia (Android TV)
> - TCL with Google TV
> - Hisense with Android TV
>
> **Check before buying.** If in doubt, ask me with the model number.

&nbsp;

### Cables & Connectors (x 4)

| # | What | Length | Connects |
|---|---|---|---|
| C1 | HDMI cable (HDMI 2.0+) | ~0.5 m (short) | PS5 → HDMI splitter |
| C2 | HDMI cable (HDMI 2.0+, 4K@60Hz) | ~1–2 m | HDMI splitter → TV (direct, 4K 60Hz) |
| C3 | HDMI cable | ~2–3 m | HDMI splitter → Tuya sync box |
| C3b | HDMI cable | ~0.3 m (very short) | Sync box passthrough → capture card |
| C4 | USB-C charging cable + wall brick | ~1–2 m | Wall power → tablet |

&nbsp;

---

&nbsp;

---

# SECTION 2 — Video Capture & Ambient Lighting

*These let the PC record the TV signal, the customer's face, and sync LED lighting to gameplay.*

&nbsp;

### Main Items

| # | What | Specific Model / Spec | Est. Price (KES) | Qty |
|---|---|---|---|---|
| 1 | **HDMI splitter (1-in, 2-out)** | Generic 1x2 HDMI splitter — 4K@60Hz, HDCP 2.2 | 2,000 | 4 |
| 2 | **Tuya HDMI Sync Box** | Tuya-compatible HDMI Sync Box with LED strip (search "Tuya HDMI sync box ambilight") — must have HDMI passthrough | 4,000–6,000 | 4 |
| 3 | **USB HDMI capture card** | MS2130 chipset, UVC, H.264 hardware encoding (search "MS2130 HDMI capture card USB 3.0") | 3,500 | 4 |
| 4 | **720p 120fps USB webcam** | ELP USB camera module (OV2710 or OV4689 sensor), 720p 120fps, UVC H.264. Or any USB webcam verified at 120fps 720p. | 5,000–10,000 | 4 |
| 5 | **Webcam desk clamp / monitor arm** | Generic adjustable desk clamp arm | 2,500 | 4 |

&nbsp;

> **Signal chain per station:**
> ```
> PS5 → Splitter → TV (4K 60Hz, direct — clean signal, zero lag)
>                → Sync Box (reads signal → LEDs) → passthrough → Capture Card → USB → PC
> ```
>
> **Why this chain?** The TV gets a direct, clean feed from the splitter — no passthrough
> devices between PS5 and TV. The sync box drives the LED lighting and passes the signal
> to the capture card. The capture card only needs 1080p for recording.
>
> **Splitter requirement:** Must support **4K@60Hz** and **HDCP 2.2**. Cheap 1x2 splitters
> work fine as long as they list these specs. Do NOT buy 1x4 splitters — you only need 2 outputs.
>
> **Capture card — MS2130 chipset is important.** These cards expose USB Audio Class on Linux,
> meaning each capture card provides both video AND audio from the TV. This eliminates the
> need for a separate audio interface. Search for "MS2130" in the listing or ask the seller
> to confirm the chipset.
>
> **Webcam — 120fps at 720p is critical.** Many webcams claim 120fps but only deliver it at
> very low resolutions. You need **120fps at 720p specifically.**
> - **ELP USB camera modules** (OV2710/OV4689 sensor) — verified 120fps at 720p, available on AliExpress
> - Search "120fps 720P UVC H.264 USB camera"
> - **Order 1 sample first** — this is the hardest component to verify
> - All 4 webcams are the same model — no special station
>
> **Sync box — check TV size compatibility.** The LED strip that comes with the sync box
> is sized for specific TV ranges. For 50" TVs, you typically need the 55" or "46-60 inch" kit.

&nbsp;

### Cables & Connectors (x 4)

| # | What | Length | Connects |
|---|---|---|---|
| C5 | USB-A 3.0 cable | ~2–3 m | Capture card → USB hub at PC |
| C6 | USB-A cable | ~2–3 m | Webcam → USB hub at PC |

&nbsp;

---

&nbsp;

---

# SECTION 3 — The Computer

*One single small PC runs the entire system — sessions, video, AI, security, everything.*

&nbsp;

### Main Items

| # | What | Specific Model | Est. Price (KES) | Qty |
|---|---|---|---|---|
| 1 | **Mini PC** (primary) | Lenovo ThinkCentre Neo 50Q Gen 4 (Intel i5-13420H, 16GB DDR4, 256GB NVMe) | 55,000–70,000 | 1 |
| 2 | **Mini PC** (cold spare) | Same model as above | 55,000–70,000 | 1 |
| 3 | **External NVMe SSD** | 256 GB NVMe M.2 2280 SSD + USB-C 3.2 Gen 2 enclosure (e.g. ORICO M2PV-C3 or UGREEN CM400) | 5,000–8,000 | 1 |
| 4 | **Powered USB 3.0 hub** | Generic 10-port USB 3.0 hub with external AC power adapter | 5,000 | 1 |
| 5 | **External USB hard drive** | 1 TB USB 3.0 portable HDD (Seagate Expansion or WD Elements) | 6,000–8,000 | 1 |
| 6 | **Color-coded cable sleeves / tape + port stickers** | 5 colors: white, red, green, yellow, blue | 500 | 1 set |

&nbsp;

> **Why a cold spare?** This is insurance against hardware failure. If the main PC dies,
> staff unplugs 5 color-coded cables and plugs them into the matching colored ports on PC2.
> No tools, no opening cases, no technical knowledge needed. Recovery time: ~3 minutes.
>
> **Why an external SSD?** So the failover is just "unplug and replug cables" — no
> screwdrivers, no opening PCs. The PCs are locked in a cupboard and never touched
> except during failover. The USB-C connection is solid and won't get bumped.
>
> **Why only 1 TB archive drive?** Security footage migrates to this drive nightly and is
> kept for 14 days. At ~5 GB/day across 5 cameras, that's ~70 GB. 1 TB gives over 6 months
> of headroom even without cleanup.
>
> **Color-coded cables:**
> | Color | Cable |
> |---|---|
> | White | External SSD (USB-C) |
> | Red | USB hub (capture cards + webcams) |
> | Green | Ethernet (network switch) |
> | Yellow | UPS monitoring (USB) |
> | Blue | Archive HDD (USB) |

&nbsp;

### Cables & Connectors

| # | What | Qty | Length | Connects |
|---|---|---|---|---|
| C7 | USB-A 3.0 cable (hub uplink) | 1 | ~0.5 m | USB hub → PC |
| C8 | USB 3.0 cable (archive drive) | 1 | ~1 m | External HDD → PC (usually included with drive) |
| C8b | USB-C 3.2 cable (external SSD) | 1 | ~0.5 m | External NVMe SSD → PC (boot/data drive) |
| C9 | Cat 6 ethernet cable | 1 | length to suit | PC → network switch (wired connection) |
| C10 | HDMI cable (setup monitor) | 1 | ~1–2 m | PC → monitor (for initial setup only) |

&nbsp;

---

&nbsp;

---

# SECTION 4 — Networking

*Everything communicates over your local network.*
*Customers don't need internet to receive their highlights — it all works over WiFi.*

&nbsp;

### Main Items

| # | What | Specific Model | Est. Price (KES) | Qty |
|---|---|---|---|---|
| 1 | **Network switch** | TP-Link TL-SG1008PE (8-port Gigabit, 124W PoE+, unmanaged) | 12,000–15,000 | 1 |
| 2 | **WiFi router** | TP-Link Archer A6 or C6 — dual-band AC1200, 4× Gigabit LAN ports, 802.11ac (WiFi 5) minimum | 5,000–7,000 | 1 |
| 3 | **4G USB dongle** | Any Safaricom/Airtel-compatible USB 4G LTE modem (e.g. Huawei E3372) | 2,500–4,000 | 1 |

&nbsp;

### Cables & Connectors

| # | What | Qty | Length | Connects |
|---|---|---|---|---|
| C11 | Cat 6 ethernet cable | 1 | ~1 m | Switch → WiFi router |
| C12 | Cat 6 ethernet cable | 5 | length to suit | Switch → each security camera |
| C13 | Cat 6 ethernet cable | 4 | length to suit (optional) | Switch → each tablet (if wall-mounted; otherwise tablets use WiFi) |

&nbsp;

> **WiFi spec — why AC1200 / 802.11ac matters:** The tablets receive highlight video files
> (50–100 MB each) over WiFi. 2.4GHz-only routers are too slow and too congested. You need
> 5GHz 802.11ac. The Archer A6/C6 are widely available in Nairobi and verified to work well.
>
> **Internet without Starlink — use a 4G USB dongle plugged into the PC.**
> The lounge system runs entirely on the local network — customers don't need internet.
> The PC only needs internet for two things: SMS alerts (Twilio) and occasional software updates.
> A USB 4G dongle handles both cheaply without replacing the router.
> Get a Safaricom or Airtel SIM with a data bundle. The dongle plugs into the PC's USB hub.
>
> **Wired vs WiFi for tablets:** If you wall-mount the tablets, run ethernet to them
> for a rock-solid connection. If they're on stands, WiFi is fine.

&nbsp;

---

&nbsp;

---

# SECTION 5 — Security Cameras

*5 cameras covering the lounge interior. Recorded continuously to the PC.*

&nbsp;

### Main Items

| # | What | Specific Model / Spec | Est. Price (KES) | Qty |
|---|---|---|---|---|
| 1 | **PoE IP camera** | Hikvision DS-2CD1023G0E-I or Dahua IPC-HFW1230S (1080p, H.265, RTSP, PoE) | 6,000 | 5 |
| 2 | **Camera mounting brackets** | Ceiling/wall mount brackets (often included with camera) | 500 | 5 |

&nbsp;

> **What to look for:**
> - Must support **RTSP** streaming (Hikvision and Dahua always do)
> - Must be **PoE** (powered over ethernet)
> - **Avoid** cameras that only work with a proprietary cloud app — they won't work
>
> **No separate power supplies needed.** The network switch in Section 4 powers these cameras through the ethernet cable.

&nbsp;

### Cables & Connectors

Already listed in Section 4:
- **C12** — Cat 6 ethernet cable x 5 (switch → each camera)

No additional cables needed. That's the beauty of PoE — one cable does everything.

&nbsp;

---

&nbsp;

---

# SECTION 6 — Power Protection

*Nairobi power cuts are real. This protects the PC and your data.*

&nbsp;

### Main Items

| # | What | Specific Model | Est. Price (KES) | Qty |
|---|---|---|---|---|
| 1 | **UPS (1500VA pure sine wave)** | APC SMC1500IC (Smart-UPS C 1500VA Tower) — pure sine wave output | 99,000 | 1 |

&nbsp;

> **"Pure sine wave" is non-negotiable.** Nairobi power cuts mean the UPS will activate
> frequently. Cheaper "simulated sine wave" or "modified sine wave" UPS units can
> instantly fry the mini PC power supply or corrupt data. Do NOT substitute with a
> cheaper non-pure-sine-wave model.
>
> **Alternative:** CyberPower CP1500PFCLCD (also pure sine wave, may be cheaper if available)
>
> **What to plug into the UPS:**
> - The PC (**must**)
> - The network switch (**must**)
> - The USB hub (**must**)
>
> **What does NOT need UPS power:**
> - TVs and PS5s — if power cuts, sessions pause and resume when power returns
> - Tablets — they have their own batteries

&nbsp;

### Cables & Connectors

| # | What | Qty | Connects |
|---|---|---|---|
| C14 | USB-B to USB-A cable | 1 | UPS → PC (for power-cut detection by the software). Usually included with the UPS. |

&nbsp;

---

&nbsp;

---

# SECTION 7 — Ambient LED Lighting

*LEDs behind each TV that sync with PS5 gameplay colours in real time.*
*The Tuya HDMI Sync Boxes from Section 2 handle this — they include the LED strips.*

&nbsp;

### Main Items

**Already purchased in Section 2.** The Tuya HDMI Sync Boxes come with built-in addressable LED strips that attach to the back of each TV. No separate LED strip purchase needed.

&nbsp;

> **How it works:**
> - During gameplay: Sync box reads the PS5 HDMI signal and drives the LEDs to match
>   the on-screen colours in real time (ambilight effect)
> - During idle: Software switches the sync box to static colour mode via WiFi —
>   LEDs show your chosen ambient lounge colour
> - At closing time: Software turns the sync box off
>
> **Sizing:** The sync box LED strip is designed for TVs. Check the sync box listing
> for compatible TV sizes. For a 50" TV, you typically get a 3-edge strip (top + sides).
>
> **Software control:** The Tuya Local API (`tinytuya` Python library) controls the sync
> box over local WiFi. Modes: `hdmi` (gameplay sync), `colour` (static ambient), `off`.

&nbsp;

### Cables & Connectors

No additional cables — the sync box connects via WiFi and HDMI (already cabled in Section 2).

&nbsp;

---

&nbsp;

---

# SECTION 8 — General Supplies

*The small things that are easy to forget.*

&nbsp;

| # | What | Est. Price (KES) | Qty | Notes |
|---|---|---|---|---|
| 1 | **Power strips** (surge protected, heavy duty) | 2,500 | 3 | One per station area. **Never daisy-chain power strips.** |
| 2 | **Cable management clips / velcro ties** | 1,000 | 1 bag of each | Makes the setup look clean and professional |
| 3 | **Label maker or label tape** | 2,000 | 1 | Label every cable at both ends. Future you will thank present you. |

&nbsp;

---

&nbsp;

---

# SECTION 9 — Contingency Items

*You might need some of these depending on your lounge layout and TV models. Don't buy them upfront — buy them if needed during setup.*

&nbsp;

| # | What | Why you might need it | Est. Price (KES) | Qty |
|---|---|---|---|---|
| 1 | **Active USB 3.0 extension cable (5m–10m)** | Standard USB 3.0 degrades after 3m. If the PC cupboard is far from any station, you need active (powered) extension cables for the capture cards and webcams. | 3,500 | up to 4 |
| 2 | **USB-C wall charging bricks** | If your tablets don't come with a charger, or the included charger cable is too short. | 1,500 | 4 |
| 3 | **RJ45 ethernet couplers / wall keystones** | For joining two ethernet cables or routing cables through walls cleanly. | 200 | 10 |
| 4 | **HDMI couplers (female-to-female)** | If any HDMI cable run from splitter to PC ends up being an awkward length — join two shorter cables. | 500 | 4 |
| 5 | **HDMI 2.0 cable (extra lengths)** | The sync box → capture card cable (C3b) is very short (0.3m). If your sync box is further from the capture card than expected, get a 1m cable instead. | 500 | 4 |

&nbsp;

---

&nbsp;

---

&nbsp;

---

# MASTER CABLE & CONNECTOR SUMMARY

*One list of every cable and connector across all sections.*
*Print this page and take it shopping.*

&nbsp;

### HDMI Cables

| Ref | What | Qty | Length | From Section |
|---|---|---|---|---|
| C1 | HDMI — PS5 → splitter | 4 | ~0.5 m (short) | 1. Gaming Stations |
| C2 | HDMI — splitter → TV (direct, 4K 60Hz) | 4 | ~1–2 m | 1. Gaming Stations |
| C3 | HDMI — splitter → Tuya sync box | 4 | ~2–3 m | 1. Gaming Stations |
| C3b | HDMI — sync box passthrough → capture card | 4 | ~0.3 m (very short) | 1. Gaming Stations |
| C10 | HDMI — PC → setup monitor | 1 | ~1–2 m | 3. The Computer |
| | | **Total: 17** | | |

&nbsp;

### USB Cables

| Ref | What | Qty | Length | From Section |
|---|---|---|---|---|
| C4 | USB-C charging — tablet (+ wall brick) | 4 | ~1–2 m | 1. Gaming Stations |
| C5 | USB-A 3.0 — capture card → hub | 4 | ~2–3 m | 2. Video Capture |
| C6 | USB-A — webcam → hub | 4 | ~2–3 m | 2. Video Capture |
| C7 | USB-A 3.0 — hub uplink → PC | 1 | ~0.5 m | 3. The Computer |
| C8 | USB 3.0 — archive drive → PC | 1 | ~1 m | 3. The Computer (usually included) |
| C8b | USB-C 3.2 — external SSD → PC | 1 | ~0.5 m | 3. The Computer (boot/data drive) |
| C14 | USB-B to A — UPS → PC | 1 | ~1–2 m | 6. Power Protection (usually included) |
| | | **Total: 16** | | |

&nbsp;

### Ethernet Cables (Cat 6)

| Ref | What | Qty | Length | From Section |
|---|---|---|---|---|
| C9 | Ethernet — PC → switch | 1 | to suit | 3. The Computer |
| C11 | Ethernet — switch → WiFi router | 1 | ~1 m | 4. Networking |
| C12 | Ethernet — switch → security cameras | 5 | to suit | 4. Networking |
| C13 | Ethernet — switch → tablets (optional) | 4 | to suit | 4. Networking |
| | | **Total: 11** (7 required + 4 optional) | | |

&nbsp;

### Grand Total — All Cables

| Type | Required | Optional |
|---|---|---|
| HDMI cables | 17 | — |
| USB cables | 16 | — |
| Ethernet cables | 7 | 4 (tablet wired connections) |
| **Total** | **40 cables** | **+ 4 optional** |

&nbsp;

---

&nbsp;

---

&nbsp;

---

# BUYING ORDER

*If you're purchasing in stages, this is the priority order.*
*Everything in the same group can be bought together.*

&nbsp;

### Group A — Open the lounge (everything needed on day one)

| # | What | Section | Qty | Est. Price (KES) |
|---|---|---|---|---|
| 1 | PS5 Slim Disc Edition + 2 DualSense controllers + charging station | 1 | 4 sets | 504,000 |
| 2 | TCL 50" 4K Google TV (P735) | 1 | 4 | 196,000 |
| 3 | Lenovo Tab M8 / Samsung Galaxy Tab A9 + wall mount | 1 | 4 | 82,000 |
| 4 | Lenovo ThinkCentre Neo 50Q Gen 4 (primary + cold spare) | 3 | 2 | 120,000 |
| 5 | External 256 GB NVMe SSD + USB-C enclosure | 3 | 1 | 7,000 |
| 6 | HDMI splitters (1x2, 4K@60Hz, HDCP 2.2) | 2 | 4 | 8,000 |
| 7 | Tuya HDMI Sync Boxes (with LED strips) | 2 | 4 | 20,000 |
| 8 | HDMI capture cards (MS2130 chipset) | 2 | 4 | 14,000 |
| 9 | ELP 720p 120fps USB webcams | 2 | 4 | 28,000 |
| 10 | Webcam desk clamp / arm | 2 | 4 | 10,000 |
| 11 | Powered USB 3.0 hub (10-port, AC powered) | 3 | 1 | 5,000 |
| 12 | TP-Link TL-SG1008PE PoE+ switch (unmanaged) | 4 | 1 | 14,000 |
| 13 | WiFi router (dual-band) | 4 | 1 | 5,000 |
| 14 | Hikvision / Dahua PoE IP cameras (1080p, RTSP) | 5 | 5 | 30,000 |
| 15 | Camera mounting brackets | 5 | 5 | 2,500 |
| 16 | APC SMC1500IC UPS (1500VA pure sine wave) | 6 | 1 | 99,000 |
| 17 | Seagate/WD 1TB USB 3.0 portable HDD | 3 | 1 | 7,000 |
| 18 | Color-coded cable sleeves/tape + port stickers | 3 | 5 colors | 500 |
| 19 | Power strips (surge protected) | 8 | 3 | 7,500 |
| 20 | All cables from Master Cable Summary above | All | ~40 | 12,000 |
| 21 | Cable management supplies + labels | 8 | 1 set | 3,000 |
| | | | **Estimated total** | **~KES 1,174,500** |

&nbsp;

> **That's it.** Everything ships at launch. There is no Phase 2 or Group B.
>
> **Before bulk-buying, order 1 sample of:**
> - The ELP webcam (verify 120fps at 720p on Linux)
> - The MS2130 capture card (verify video + audio both work on Ubuntu 24.04)
> - The Tuya HDMI sync box (verify passthrough works and tinytuya can control it)

&nbsp;

---

*For any questions about specific models available in Nairobi, or whether a particular item you find locally will work, just ask.*
