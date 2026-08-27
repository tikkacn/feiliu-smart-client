import { useCallback } from 'react'

import { getIpInfo } from '@/services/api'
import {
  getCachedFlystreamManifest,
  getFlystreamManifest,
  getFlystreamPolicy,
  isFlystreamApiConfigured,
  resolveFlystreamNetwork,
} from '@/services/flystream-api'
import { useQuery } from '@/services/query-client'

export function useFlystreamPolicy() {
  const manifestQuery = useQuery({
    queryKey: ['flystream', 'manifest'],
    queryFn: getFlystreamManifest,
    enabled: isFlystreamApiConfigured,
    initialData: getCachedFlystreamManifest(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  const activeVersion = manifestQuery.data?.activePolicyVersion
  const policyQuery = useQuery({
    queryKey: ['flystream', 'policy', activeVersion],
    queryFn: () => getFlystreamPolicy(activeVersion || ''),
    enabled: isFlystreamApiConfigured && Boolean(activeVersion),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  const networkQuery = useQuery({
    queryKey: ['flystream', 'network'],
    queryFn: async () => {
      const ipInfo = await getIpInfo()
      return resolveFlystreamNetwork({
        asn: ipInfo.asn,
        isp: ipInfo.asn_organization || ipInfo.organization,
      })
    },
    enabled: isFlystreamApiConfigured,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  })
  const refetchManifest = manifestQuery.refetch
  const refetchPolicy = policyQuery.refetch

  const refresh = useCallback(async () => {
    await refetchManifest()
    await refetchPolicy()
  }, [refetchManifest, refetchPolicy])

  return {
    configured: isFlystreamApiConfigured,
    manifest: manifestQuery.data,
    policy: policyQuery.data,
    network: networkQuery.data,
    error: manifestQuery.error || policyQuery.error || networkQuery.error,
    loading:
      manifestQuery.isLoading ||
      policyQuery.isLoading ||
      networkQuery.isLoading,
    refreshing:
      manifestQuery.isFetching ||
      policyQuery.isFetching ||
      networkQuery.isFetching,
    refresh,
  }
}
