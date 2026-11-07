import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.ts'

/** Исполнители для выбора в форме задачи (форма есть только у постановщика). */
export function useExecutors(enabled = true) {
  return useQuery({
    queryKey: ['executors'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'executor')
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}
