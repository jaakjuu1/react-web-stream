/*
  Warnings:

  - You are about to drop the `MotionEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MotionEvent";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "DetectionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'motion',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,
    "confidence" REAL,
    "thumbnailPath" TEXT,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "markedFalsePositive" BOOLEAN NOT NULL DEFAULT false,
    "roomId" TEXT NOT NULL,
    CONSTRAINT "DetectionEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DetectionEvent_roomId_idx" ON "DetectionEvent"("roomId");

-- CreateIndex
CREATE INDEX "DetectionEvent_timestamp_idx" ON "DetectionEvent"("timestamp");

-- CreateIndex
CREATE INDEX "DetectionEvent_deviceId_idx" ON "DetectionEvent"("deviceId");

-- CreateIndex
CREATE INDEX "DetectionEvent_type_idx" ON "DetectionEvent"("type");
