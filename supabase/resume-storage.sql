insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

drop policy if exists "Users can read their own resumes" on storage.objects;
create policy "Users can read their own resumes"
on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload their own resumes" on storage.objects;
create policy "Users can upload their own resumes"
on storage.objects for insert to authenticated
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own resumes" on storage.objects;
create policy "Users can delete their own resumes"
on storage.objects for delete to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);