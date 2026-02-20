
-- Create storage bucket for department icons
INSERT INTO storage.buckets (id, name, public) VALUES ('department-icons', 'department-icons', true);

-- Allow anyone to view department icons
CREATE POLICY "Department icons are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'department-icons');

-- Allow owner to upload department icons
CREATE POLICY "Owner can upload department icons"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'department-icons' AND public.has_role(auth.uid(), 'owner'::app_role));

-- Allow owner to update department icons
CREATE POLICY "Owner can update department icons"
ON storage.objects FOR UPDATE
USING (bucket_id = 'department-icons' AND public.has_role(auth.uid(), 'owner'::app_role));

-- Allow owner to delete department icons
CREATE POLICY "Owner can delete department icons"
ON storage.objects FOR DELETE
USING (bucket_id = 'department-icons' AND public.has_role(auth.uid(), 'owner'::app_role));

-- Add icon_url column to departments for uploaded images
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS icon_url text;
