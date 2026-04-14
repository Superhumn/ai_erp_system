ALTER TABLE `products`
  ADD COLUMN `manufacturingStage` enum('raw_material','semi_finished_good','finished_product') NOT NULL DEFAULT 'finished_product';
