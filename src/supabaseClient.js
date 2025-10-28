import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iqasbrvsxvudhrvtzoyw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxYXNicnZzeHZ1ZGhydnR6b3l3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1OTg3OTgsImV4cCI6MjA3NzE3NDc5OH0.Pxt0fYzVoOPVfxup7vcrrdh3a5fXUczsoX5Vbz3wVzA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
