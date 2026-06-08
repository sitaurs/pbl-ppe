-- CreateTable
CREATE TABLE "GasTelemetry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" INTEGER NOT NULL,
    "sektorId" TEXT NOT NULL,
    "raw" INTEGER NOT NULL,
    "alert" BOOLEAN NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GasTelemetry_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GasTelemetry_nodeId_timestamp_idx" ON "GasTelemetry"("nodeId", "timestamp");

-- CreateIndex
CREATE INDEX "GasTelemetry_timestamp_idx" ON "GasTelemetry"("timestamp");

-- CreateIndex
CREATE INDEX "GasTelemetry_alert_timestamp_idx" ON "GasTelemetry"("alert", "timestamp");
