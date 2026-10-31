-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'DOC_STAFF', 'FIELD_OFFICER', 'FORWARDER');

-- CreateEnum
CREATE TYPE "LegalityType" AS ENUM ('SHM', 'SKT', 'SKD', 'OTHER', 'NONE');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('PENDING', 'PASS', 'REVIEW', 'RISK', 'ERROR');

-- CreateEnum
CREATE TYPE "ProductForm" AS ENUM ('CHERRY', 'PARCHMENT', 'GREEN');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'CHECKING', 'READY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('LC', 'TT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'PACKING_LIST', 'BILL_OF_LADING', 'COO', 'PHYTO', 'PEB', 'LC', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'DONE', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "npwp" TEXT,
    "address" TEXT,
    "country" TEXT NOT NULL DEFAULT 'ID',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "password_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invite_token_hash" TEXT,
    "invite_expires_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" TEXT NOT NULL,
    "actor_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" TEXT,
    "full_name" TEXT NOT NULL,
    "village" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "regency" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "phone" TEXT,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "consent_scope" TEXT NOT NULL,
    "field_clock" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "farmer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plot" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" TEXT,
    "farmer_id" UUID NOT NULL,
    "label" TEXT,
    "geom_point" JSONB,
    "geom_polygon" JSONB,
    "declared_area_ha" DECIMAL(10,4) NOT NULL,
    "computed_area_ha" DECIMAL(10,4),
    "gps_accuracy_m" DECIMAL(8,2),
    "captured_at" TIMESTAMP(3),
    "captured_by" UUID,
    "risk_status" "RiskStatus" NOT NULL DEFAULT 'PENDING',
    "field_clock" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "plot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legality_evidence" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" TEXT,
    "plot_id" UUID NOT NULL,
    "type" "LegalityType" NOT NULL,
    "document_number" TEXT,
    "photo_keys" TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "legality_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_dataset" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "geojson" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "reference_dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_check" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "plot_id" UUID NOT NULL,
    "dataset_version" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "forest_pct_2020" DECIMAL(6,2),
    "overlaps_forest_area" BOOLEAN NOT NULL DEFAULT false,
    "status" "RiskStatus" NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "decision_status" "RiskStatus",
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "verification_photo_keys" TEXT[],
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "risk_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" TEXT,
    "farmer_id" UUID NOT NULL,
    "plot_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "weight_kg" DECIMAL(12,2) NOT NULL,
    "form" "ProductForm" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "product_form" "ProductForm" NOT NULL,
    "weight_kg" DECIMAL(12,2) NOT NULL,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_purchase" (
    "lot_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,

    CONSTRAINT "lot_purchase_pkey" PRIMARY KEY ("lot_id","purchase_id")
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_address" TEXT,
    "buyer_country" TEXT NOT NULL,
    "port_loading" TEXT NOT NULL,
    "port_discharge" TEXT NOT NULL,
    "hs_code" TEXT NOT NULL DEFAULT '0901',
    "product_description" TEXT,
    "net_weight_kg" DECIMAL(12,2),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_method" "PaymentMethod" NOT NULL,
    "last_validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_lot" (
    "shipment_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,

    CONSTRAINT "shipment_lot_pkey" PRIMARY KEY ("shipment_id","lot_id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "detected_type" "DocumentType",
    "type_confidence" DECIMAL(4,3),
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "page_count" INTEGER,
    "extraction_status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "raw_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_field" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT,
    "confidence" DECIMAL(4,3) NOT NULL,
    "page" INTEGER,
    "bbox" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "corrected_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "extracted_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "rule_id" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "suggestion" TEXT,
    "refs" JSONB NOT NULL DEFAULT '[]',
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "accept_reason" TEXT,
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_pack" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "pdf_key" TEXT NOT NULL,
    "geojson_key" TEXT NOT NULL,
    "json_key" TEXT NOT NULL,
    "dataset_version" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "evidence_pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "evidence_pack_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_access_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "share_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_receipt" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "op_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "sync_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_invite_token_hash_key" ON "user"("invite_token_hash");

-- CreateIndex
CREATE INDEX "user_org_id_idx" ON "user"("org_id");

-- CreateIndex
CREATE INDEX "audit_log_org_id_created_at_idx" ON "audit_log"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "farmer_org_id_idx" ON "farmer"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_org_id_client_id_key" ON "farmer"("org_id", "client_id");

-- CreateIndex
CREATE INDEX "plot_org_id_idx" ON "plot"("org_id");

-- CreateIndex
CREATE INDEX "plot_farmer_id_idx" ON "plot"("farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "plot_org_id_client_id_key" ON "plot"("org_id", "client_id");

-- CreateIndex
CREATE INDEX "legality_evidence_plot_id_idx" ON "legality_evidence"("plot_id");

-- CreateIndex
CREATE UNIQUE INDEX "legality_evidence_org_id_client_id_key" ON "legality_evidence"("org_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "reference_dataset_kind_version_key" ON "reference_dataset"("kind", "version");

-- CreateIndex
CREATE INDEX "risk_check_plot_id_created_at_idx" ON "risk_check"("plot_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_check_org_id_idx" ON "risk_check"("org_id");

-- CreateIndex
CREATE INDEX "purchase_org_id_idx" ON "purchase"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_org_id_client_id_key" ON "purchase"("org_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "lot_org_id_code_key" ON "lot"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "lot_purchase_purchase_id_key" ON "lot_purchase"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_org_id_reference_key" ON "shipment"("org_id", "reference");

-- CreateIndex
CREATE INDEX "document_shipment_id_idx" ON "document"("shipment_id");

-- CreateIndex
CREATE INDEX "document_sha256_idx" ON "document"("sha256");

-- CreateIndex
CREATE INDEX "extracted_field_document_id_is_current_idx" ON "extracted_field"("document_id", "is_current");

-- CreateIndex
CREATE INDEX "finding_shipment_id_status_idx" ON "finding"("shipment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_pack_shipment_id_version_key" ON "evidence_pack"("shipment_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_token_hash_key" ON "share_link"("token_hash");

-- CreateIndex
CREATE INDEX "job_org_id_created_at_idx" ON "job"("org_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_receipt_org_id_op_id_key" ON "sync_receipt"("org_id", "op_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer" ADD CONSTRAINT "farmer_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plot" ADD CONSTRAINT "plot_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legality_evidence" ADD CONSTRAINT "legality_evidence_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_check" ADD CONSTRAINT "risk_check_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_purchase" ADD CONSTRAINT "lot_purchase_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_purchase" ADD CONSTRAINT "lot_purchase_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_lot" ADD CONSTRAINT "shipment_lot_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_lot" ADD CONSTRAINT "shipment_lot_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_field" ADD CONSTRAINT "extracted_field_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding" ADD CONSTRAINT "finding_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_pack" ADD CONSTRAINT "evidence_pack_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_evidence_pack_id_fkey" FOREIGN KEY ("evidence_pack_id") REFERENCES "evidence_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
