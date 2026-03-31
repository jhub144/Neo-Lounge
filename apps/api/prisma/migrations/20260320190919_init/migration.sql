-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('AVAILABLE', 'ACTIVE', 'PENDING', 'FAULT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'POWER_INTERRUPTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MPESA');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "GameEndMethod" AS ENUM ('AI_DETECTED', 'MANUAL_BUTTON', 'SESSION_END');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('CROWD_ROAR', 'WHISTLE', 'OTHER');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('CASH_PAYMENT', 'MPESA_PAYMENT', 'MPESA_TIMEOUT', 'SESSION_START', 'SESSION_END', 'SESSION_EXTENDED', 'HARDWARE_FAULT', 'FREE_TIME_GRANTED', 'ADMIN_OVERRIDE', 'SHIFT_START', 'SHIFT_END', 'SESSION_TRANSFER', 'POWER_LOSS', 'POWER_RESTORE', 'STATION_FAULT', 'SYSTEM_STARTUP');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'NOTIFIED', 'EXPIRED', 'CONVERTED');

-- CreateTable
CREATE TABLE "Station" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StationStatus" NOT NULL DEFAULT 'AVAILABLE',
    "currentSessionId" INTEGER,
    "adbAddress" TEXT NOT NULL DEFAULT '',
    "tuyaDeviceId" TEXT NOT NULL DEFAULT '',
    "captureDevice" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "stationId" INTEGER NOT NULL,
    "staffPin" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL,
    "remainingAtPowerLoss" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "authCode" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "mpesaReceipt" TEXT,
    "staffPin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "endMethod" "GameEndMethod",

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplayClip" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "triggerType" "TriggerType" NOT NULL,
    "triggerTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "stitchedReelPath" TEXT,

    CONSTRAINT "ReplayClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" SERIAL NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "staffPin" TEXT,
    "stationId" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "clipsGenerated" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityClip" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "cameraId" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityCamera" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "rtspUrl" TEXT NOT NULL DEFAULT '',
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SecurityCamera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "baseHourlyRate" INTEGER NOT NULL DEFAULT 300,
    "openingTime" TEXT NOT NULL DEFAULT '08:00',
    "closingTime" TEXT NOT NULL DEFAULT '22:00',
    "replayTTLMinutes" INTEGER NOT NULL DEFAULT 60,
    "powerSaveBrightness" INTEGER NOT NULL DEFAULT 50,
    "yamnetConfidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "clipBufferBefore" INTEGER NOT NULL DEFAULT 10,
    "clipBufferAfter" INTEGER NOT NULL DEFAULT 15,
    "clipCooldownSeconds" INTEGER NOT NULL DEFAULT 45,
    "securityClipBeforeMinutes" INTEGER NOT NULL DEFAULT 5,
    "securityClipAfterMinutes" INTEGER NOT NULL DEFAULT 5,
    "securityRetentionDays" INTEGER NOT NULL DEFAULT 14,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationQueue" (
    "id" SERIAL NOT NULL,
    "stationId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',

    CONSTRAINT "StationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_authCode_key" ON "Session"("authCode");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_pin_key" ON "Staff"("pin");

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_currentSessionId_fkey" FOREIGN KEY ("currentSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayClip" ADD CONSTRAINT "ReplayClip_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayClip" ADD CONSTRAINT "ReplayClip_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityClip" ADD CONSTRAINT "SecurityClip_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SecurityEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityClip" ADD CONSTRAINT "SecurityClip_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "SecurityCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationQueue" ADD CONSTRAINT "StationQueue_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
