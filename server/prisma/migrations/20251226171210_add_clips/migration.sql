-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "storageType" TEXT NOT NULL DEFAULT 'local',
    "mimeType" TEXT NOT NULL DEFAULT 'video/webm',
    "fileSize" INTEGER NOT NULL,
    "duration" INTEGER,
    "detectionType" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Clip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Clip_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Clip_userId_roomId_idx" ON "Clip"("userId", "roomId");

-- CreateIndex
CREATE INDEX "Clip_roomId_recordedAt_idx" ON "Clip"("roomId", "recordedAt");

-- CreateIndex
CREATE INDEX "Clip_deviceId_idx" ON "Clip"("deviceId");
