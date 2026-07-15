-- Clients may permanently delete orders that have not entered lab processing yet.
DROP POLICY IF EXISTS "Users can delete own pending orders" ON orders;
CREATE POLICY "Users can delete own pending orders"
  ON orders FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'received');
