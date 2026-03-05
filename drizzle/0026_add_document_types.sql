-- Add new document types to parsed_document_type enum
ALTER TABLE `parsed_documents` MODIFY COLUMN `documentType` enum('receipt','invoice','purchase_order','bill_of_lading','packing_list','customs_document','freight_quote','shipping_label','credit_memo','bank_statement','sales_order','contract','quote','term_sheet','contact_card','other') NOT NULL;
