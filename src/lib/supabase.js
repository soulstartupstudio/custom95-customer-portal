import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qhgdmdtqssjylfwetpna.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RtZHRxc3NqeWxmd2V0cG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MjUsImV4cCI6MjA5MTIyOTYyNX0.ZcmBzF7XF5bfCHylRSzoxhFzjo9iKLfBP9gMGn--lFs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
