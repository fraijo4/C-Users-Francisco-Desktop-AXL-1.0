-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "crossed" TEXT,
ADD COLUMN     "customsPreview" TEXT,
ADD COLUMN     "delivered" TEXT,
ADD COLUMN     "invoices" TEXT,
ADD COLUMN     "paperwork" TEXT,
ADD COLUMN     "rowColor" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "stop" TEXT;
