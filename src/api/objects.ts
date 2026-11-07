import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.ts'
import { useInvalidateAll } from './invalidate.ts'

// Фильтрацию «кто что видит» делает база (RLS): исполнитель получит только объекты,
// где у него есть задачи, и только свои задачи внутри них — тем же самым запросом.

export function useObjects() {
  return useQuery({
    queryKey: ['objects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .select('id, name, address, created_at, tasks(id, status)')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export type ObjectListItem = NonNullable<ReturnType<typeof useObjects>['data']>[number]

export function useObject(objectId: string | undefined) {
  return useQuery({
    queryKey: ['objects', 'detail', objectId],
    enabled: Boolean(objectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .select('id, name, address, created_at')
        .eq('id', objectId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export type ObjectInput = { name: string; address: string }

export function useSaveObject() {
  const invalidateAll = useInvalidateAll()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ObjectInput }) => {
      const { data, error } = id
        ? await supabase.from('objects').update(values).eq('id', id).select('id').single()
        : await supabase.from('objects').insert(values).select('id').single()
      if (error) throw error
      return data
    },
    onSuccess: invalidateAll,
  })
}

export function useDeleteObject() {
  const invalidateAll = useInvalidateAll()
  return useMutation({
    mutationFn: async (objectId: string) => {
      const { error } = await supabase.rpc('delete_object', { p_object_id: objectId })
      if (error) throw error
    },
    onSuccess: invalidateAll,
  })
}
