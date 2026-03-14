/*
  Warnings:

  - You are about to drop the column `email` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `User` table. All the data in the column will be lost.
  - Added the required column `clerkId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerkId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "stripeCustomerId" TEXT,
    "subscriptionId" TEXT,
    "subscriptionStatus" TEXT,
    "subscriptionPlanId" TEXT,
    "currentPeriodEnd" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("cancelAtPeriodEnd", "createdAt", "currentPeriodEnd", "id", "stripeCustomerId", "subscriptionId", "subscriptionPlanId", "subscriptionStatus", "updatedAt") SELECT "cancelAtPeriodEnd", "createdAt", "currentPeriodEnd", "id", "stripeCustomerId", "subscriptionId", "subscriptionPlanId", "subscriptionStatus", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_subscriptionId_key" ON "User"("subscriptionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
