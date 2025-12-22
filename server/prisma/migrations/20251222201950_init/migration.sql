-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "livekitRoom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Room_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'mobile',
    "participantId" TEXT NOT NULL,
    "lastSeen" DATETIME,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT,
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Device_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PairingCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "PairingCode_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "fileSize" BIGINT,
    "duration" INTEGER,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "storageType" TEXT NOT NULL DEFAULT 'local',
    "storagePath" TEXT NOT NULL,
    "egressId" TEXT,
    "roomId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recording_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MotionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,
    "confidence" REAL,
    "thumbnailPath" TEXT,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "roomId" TEXT NOT NULL,
    CONSTRAINT "MotionEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Room_livekitRoom_key" ON "Room"("livekitRoom");

-- CreateIndex
CREATE INDEX "Room_userId_idx" ON "Room"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_participantId_key" ON "Device"("participantId");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "Device_roomId_idx" ON "Device"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "PairingCode_code_key" ON "PairingCode"("code");

-- CreateIndex
CREATE INDEX "PairingCode_code_idx" ON "PairingCode"("code");

-- CreateIndex
CREATE INDEX "Recording_roomId_idx" ON "Recording"("roomId");

-- CreateIndex
CREATE INDEX "Recording_startedAt_idx" ON "Recording"("startedAt");

-- CreateIndex
CREATE INDEX "MotionEvent_roomId_idx" ON "MotionEvent"("roomId");

-- CreateIndex
CREATE INDEX "MotionEvent_timestamp_idx" ON "MotionEvent"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
