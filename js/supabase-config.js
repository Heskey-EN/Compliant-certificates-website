/* Compliant Property Certificates — Supabase connection.
   The anon key is designed to be public (safe in front-end code);
   all real access control is enforced server-side by row-level security.
   Requires the supabase-js UMD script to be loaded first. */

const SUPABASE_URL = "https://mndsjaagubxtdcqdjsbj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZHNqYWFndWJ4dGRjcWRqc2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTk3MTEsImV4cCI6MjA5NzM3NTcxMX0.4a3PK_ur0idj1iNtlmPqhuTvHDiKloTQWPzcaAZzF-o";

/* Usernames are mapped to an internal email for Supabase Auth.
   "Terry-Admin" -> "terry-admin@compliantpropertycertificates.co.uk" */
const LOGIN_EMAIL_DOMAIN = "compliantpropertycertificates.co.uk";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function usernameToEmail(username) {
  return String(username).trim().toLowerCase() + "@" + LOGIN_EMAIL_DOMAIN;
}
