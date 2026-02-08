-- CreateTable
CREATE TABLE "ProjectAuthorMetric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "personId" TEXT,
    "gitEmail" TEXT NOT NULL,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAuthorMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectAuthorMetric_projectId_timestamp_idx" ON "ProjectAuthorMetric"("projectId", "timestamp");

-- CreateIndex
CREATE INDEX "ProjectAuthorMetric_gitEmail_timestamp_idx" ON "ProjectAuthorMetric"("gitEmail", "timestamp");

-- AddForeignKey
ALTER TABLE "ProjectAuthorMetric" ADD CONSTRAINT "ProjectAuthorMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAuthorMetric" ADD CONSTRAINT "ProjectAuthorMetric_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
