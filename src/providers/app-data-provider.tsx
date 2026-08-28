import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getBaseConfig,
  getRuleProviders,
  getRules,
} from 'tauri-plugin-mihomo-api'

import { useClashInfo, useRuntimeConfig } from '@/hooks/use-clash'
import { runStateQueryKey } from '@/hooks/use-system-state'
import { useVerge } from '@/hooks/use-verge'
import { getIpInfo } from '@/services/api'
import {
  getAppUptime,
  getProxyView,
  getRuntimeState,
  getSystemProxy,
  setSmartNetwork,
  syncSmartClassifications,
} from '@/services/cmds'
import { subscribeVergeEvents } from '@/services/events'
import { showNotice } from '@/services/notice-service'
import { revalidateQueries, useQuery } from '@/services/query-client'
import { classifySmartOperator, type SmartOperator } from '@/types/smart-route'
import { resolveDisplayedMixedPort } from '@/utils/mixed-port'

import {
  ClashConfigContext,
  CoreDataStatusContext,
  ProxiesContext,
  RefreshersContext,
  RulesContext,
  SystemContext,
  UptimeContext,
} from './app-data-context'

const TQ_MIHOMO = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: 1500,
  retry: 3,
  retryDelay: (attempt: number) => Math.min(200 * 2 ** attempt, 3000),
} as const

const TQ_DEFAULTS = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: 5000,
  retry: 2,
} as const

const SMART_CLASSIFICATION_REFRESH_INTERVAL = 6 * 60 * 60 * 1000

const SMART_OPERATOR_LABEL_KEYS: Record<SmartOperator, string> = {
  telecom: 'settings.sections.smartRoute.network.telecom',
  unicom: 'settings.sections.smartRoute.network.unicom',
  mobile: 'settings.sections.smartRoute.network.mobile',
  unknown: 'settings.sections.smartRoute.network.other',
}

interface SmartNetworkPrompt {
  detectedOperator: SmartOperator
  detectedConfidence: number
  changed: boolean
}

function useStableFn<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T
}

// 全局数据提供者组件
export const AppDataProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const { data: runtimeConfig } = useRuntimeConfig()
  const { clashInfo } = useClashInfo()

  const {
    data: proxyView,
    error: proxyViewError,
    isPending: isProxyViewPending,
    refetch: _refetchProxyView,
  } = useQuery({
    queryKey: ['getProxyView'],
    queryFn: getProxyView,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    ...TQ_MIHOMO,
  })

  const {
    data: clashConfig,
    isPending: isClashConfigPending,
    refetch: _refetchClashConfig,
  } = useQuery({
    queryKey: ['getClashConfig'],
    queryFn: getBaseConfig,
    ...TQ_MIHOMO,
  })

  const { data: ruleProviders, refetch: _refetchRuleProviders } = useQuery({
    queryKey: ['getRuleProviders'],
    queryFn: getRuleProviders,
    ...TQ_MIHOMO,
    revalidateOnMount: false,
  })

  const { data: rulesData, refetch: _refetchRules } = useQuery({
    queryKey: ['getRules'],
    queryFn: getRules,
    ...TQ_MIHOMO,
  })

  const { data: sysproxy, refetch: _refetchSysproxy } = useQuery({
    queryKey: ['getSystemProxy'],
    queryFn: getSystemProxy,
    ...TQ_DEFAULTS,
  })

  // Same key as `useSystemState`, so this is the one Run State cache entry, not a second one.
  const { data: runState, isPending: isRunningModePending } = useQuery({
    queryKey: runStateQueryKey,
    queryFn: getRuntimeState,
    ...TQ_DEFAULTS,
  })
  const runningMode = runState?.mode

  const proxyNodeSignature = useMemo(
    () =>
      Object.values(proxyView?.records ?? {})
        .filter(
          (node) =>
            !['direct', 'reject'].includes(node.type.toLowerCase()) &&
            !['DIRECT', 'REJECT'].includes(node.name.toUpperCase()),
        )
        .map((node) =>
          node.source.kind === 'provider'
            ? `provider:${node.source.providerName}:${node.name}`
            : `subscription:${node.name}`,
        )
        .sort()
        .join('\u0000'),
    [proxyView?.records],
  )
  const remoteSyncSignatureRef = useRef<string | null>(null)
  const hasVerge = Boolean(verge)
  const detectedOperatorRef = useRef<SmartOperator | null>(null)
  const [smartNetworkPrompt, setSmartNetworkPrompt] =
    React.useState<SmartNetworkPrompt | null>(null)
  const [selectedSmartOperator, setSelectedSmartOperator] =
    React.useState<SmartOperator>('unknown')
  const [applyingSmartNetwork, setApplyingSmartNetwork] = React.useState(false)

  useEffect(() => {
    if (!hasVerge || !proxyNodeSignature) {
      return
    }

    let disposed = false
    const sync = async (force = false) => {
      if (
        disposed ||
        (!force && remoteSyncSignatureRef.current === proxyNodeSignature)
      ) {
        return
      }

      remoteSyncSignatureRef.current = proxyNodeSignature
      try {
        await syncSmartClassifications()
      } catch (error) {
        remoteSyncSignatureRef.current = null
        // The last successful manifest remains in the local config. A later
        // periodic refresh or subscription change will retry the sync.
        console.debug('[smart-route] remote classification unavailable', error)
      }
    }

    void sync()
    const timer = window.setInterval(() => {
      void sync(true)
    }, SMART_CLASSIFICATION_REFRESH_INTERVAL)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [hasVerge, proxyNodeSignature])

  useEffect(() => {
    if (!proxyNodeSignature) return
    let disposed = false

    const refreshSmartNetwork = async () => {
      try {
        const ipInfo = await getIpInfo()
        if (disposed) return
        const isDomestic = ipInfo.country_code.trim().toUpperCase() === 'CN'
        const network = isDomestic
          ? classifySmartOperator({
              asn: ipInfo.asn,
              isp: ipInfo.asn_organization || ipInfo.organization,
            })
          : { operator: 'unknown' as const, confidence: 0.15 }
        if (detectedOperatorRef.current === network.operator) return

        const changed = detectedOperatorRef.current !== null
        detectedOperatorRef.current = network.operator
        setSelectedSmartOperator(network.operator)
        setSmartNetworkPrompt({
          detectedOperator: network.operator,
          detectedConfidence: network.confidence,
          changed,
        })
      } catch (error) {
        // Automatic selection still works through Mihomo's local url-test group
        // when the optional operator lookup is unavailable.
        console.debug('[smart-route] network classification unavailable', error)
      }
    }

    void refreshSmartNetwork()
    const timer = window.setInterval(refreshSmartNetwork, 30 * 60 * 1000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [proxyNodeSignature])

  const smartOperatorLabel = (operator: SmartOperator) =>
    t(SMART_OPERATOR_LABEL_KEYS[operator])

  const applySmartNetwork = async () => {
    if (!smartNetworkPrompt) return
    setApplyingSmartNetwork(true)
    try {
      const confidence =
        selectedSmartOperator === smartNetworkPrompt.detectedOperator
          ? smartNetworkPrompt.detectedConfidence
          : selectedSmartOperator === 'unknown'
            ? 0.15
            : 1
      await setSmartNetwork(selectedSmartOperator, confidence)
      setSmartNetworkPrompt(null)
    } catch (error) {
      showNotice.error(error)
    } finally {
      setApplyingSmartNetwork(false)
    }
  }

  const { data: uptimeData } = useQuery({
    queryKey: ['appUptime'],
    queryFn: getAppUptime,
    ...TQ_DEFAULTS,
    refetchInterval: 3000,
    retry: 1,
  })

  const refreshProxy = useStableFn(_refetchProxyView)
  const refreshClashConfig = useStableFn(_refetchClashConfig)
  const refreshRules = useStableFn(_refetchRules)
  const refreshSysproxy = useStableFn(_refetchSysproxy)
  const refreshRuleProviders = useStableFn(_refetchRuleProviders)

  useEffect(() => {
    let lastProfileId: string | null = null
    let lastProfileUpdateTime = 0
    let lastProxyUpdateTime = 0
    const refreshThrottle = 800
    const handleProfileChanged = (newProfileId: string) => {
      const now = Date.now()
      if (
        lastProfileId === newProfileId &&
        now - lastProfileUpdateTime < refreshThrottle
      ) {
        return
      }
      lastProfileId = newProfileId
      lastProfileUpdateTime = now
      void revalidateQueries([['getProfiles']])
    }

    const handleRefreshProxy = () => {
      const now = Date.now()
      if (now - lastProxyUpdateTime <= refreshThrottle) return
      lastProxyUpdateTime = now
      refreshProxy().catch(() => {})
    }

    const handleRefreshProfiles = () => {
      void revalidateQueries([['getProfiles']])
    }

    return subscribeVergeEvents({
      'profile-changed': handleProfileChanged,
      'verge://refresh-profiles': handleRefreshProfiles,
      'verge://refresh-proxy-config': handleRefreshProxy,
    })
  }, [refreshProxy])

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshProxy(),
      refreshClashConfig(),
      refreshRules(),
      refreshSysproxy(),
      refreshRuleProviders(),
    ])
  }, [
    refreshProxy,
    refreshClashConfig,
    refreshRules,
    refreshSysproxy,
    refreshRuleProviders,
  ])

  const proxiesValue = useMemo(
    () => ({
      proxyView,
      isProxyViewPending,
      isProxyViewError: Boolean(proxyViewError),
    }),
    [proxyView, isProxyViewPending, proxyViewError],
  )

  const rulesValue = useMemo(
    () => ({
      rules: rulesData?.rules ?? [],
      ruleProviders: ruleProviders?.providers || {},
    }),
    [rulesData, ruleProviders],
  )

  const clashConfigValue = useMemo(
    () => ({
      clashConfig,
      isClashConfigPending,
    }),
    [clashConfig, isClashConfigPending],
  )

  // Resolved from local sources rather than via useDisplayedMixedPort: that hook reads the
  // ClashConfig context, and this component is the one providing it.
  const displayedMixedPort = resolveDisplayedMixedPort({
    live: clashConfig?.mixedPort,
    runtime: runtimeConfig?.['mixed-port'],
    selected: verge?.verge_mixed_port,
    merge: clashInfo?.mixed_port,
  })

  const systemValue = useMemo(() => {
    const calculateSystemProxyAddress = () => {
      if (!verge) return '-'

      const isPacMode = verge.proxy_auto_config ?? false

      if (isPacMode) {
        // PAC模式：显示我们期望设置的代理地址
        const proxyHost = verge.proxy_host || '127.0.0.1'
        return `${proxyHost}:${displayedMixedPort}`
      } else {
        // HTTP代理模式：优先使用系统地址，但如果格式不正确则使用期望地址
        const systemServer = sysproxy?.server
        if (
          systemServer &&
          systemServer !== '-' &&
          !systemServer.startsWith(':')
        ) {
          return systemServer
        } else {
          // 系统地址无效，返回期望的代理地址
          const proxyHost = verge.proxy_host || '127.0.0.1'
          return `${proxyHost}:${displayedMixedPort}`
        }
      }
    }

    return {
      sysproxy,
      runningMode,
      isRunningModePending,
      systemProxyAddress: calculateSystemProxyAddress(),
    }
  }, [sysproxy, runningMode, isRunningModePending, verge, displayedMixedPort])

  const uptimeValue = useMemo(() => ({ uptime: uptimeData || 0 }), [uptimeData])

  const coreDataStatusValue = useMemo(
    () => ({
      isCoreDataPending: isProxyViewPending || isClashConfigPending,
    }),
    [isProxyViewPending, isClashConfigPending],
  )

  const refreshersValue = useMemo(
    () => ({
      refreshProxy,
      refreshClashConfig,
      refreshRules,
      refreshSysproxy,
      refreshRuleProviders,
      refreshAll,
    }),
    [
      refreshProxy,
      refreshClashConfig,
      refreshRules,
      refreshSysproxy,
      refreshRuleProviders,
      refreshAll,
    ],
  )

  return (
    <>
      <ProxiesContext value={proxiesValue}>
        <RulesContext value={rulesValue}>
          <ClashConfigContext value={clashConfigValue}>
            <SystemContext value={systemValue}>
              <UptimeContext value={uptimeValue}>
                <CoreDataStatusContext value={coreDataStatusValue}>
                  <RefreshersContext value={refreshersValue}>
                    {children}
                  </RefreshersContext>
                </CoreDataStatusContext>
              </UptimeContext>
            </SystemContext>
          </ClashConfigContext>
        </RulesContext>
      </ProxiesContext>

      <Dialog
        open={smartNetworkPrompt !== null}
        onClose={() => setSmartNetworkPrompt(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {smartNetworkPrompt?.changed
            ? t('settings.sections.smartRoute.network.changed')
            : t('settings.sections.smartRoute.network.title')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {smartNetworkPrompt?.detectedOperator === 'unknown'
              ? t('settings.sections.smartRoute.network.unknownHint')
              : t('settings.sections.smartRoute.network.detectedHint', {
                  operator: smartNetworkPrompt
                    ? smartOperatorLabel(smartNetworkPrompt.detectedOperator)
                    : '',
                })}
          </Typography>
          <FormControl>
            <RadioGroup
              value={selectedSmartOperator}
              onChange={(event) =>
                setSelectedSmartOperator(event.target.value as SmartOperator)
              }
            >
              {(['telecom', 'unicom', 'mobile', 'unknown'] as const).map(
                (operator) => (
                  <FormControlLabel
                    key={operator}
                    value={operator}
                    control={<Radio />}
                    label={`${operator === 'unknown' ? '4' : operator === 'telecom' ? '1' : operator === 'unicom' ? '2' : '3'} · ${smartOperatorLabel(operator)}`}
                  />
                ),
              )}
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSmartNetworkPrompt(null)}
            disabled={applyingSmartNetwork}
          >
            {t('settings.sections.smartRoute.network.later')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void applySmartNetwork()}
            disabled={applyingSmartNetwork}
          >
            {t('settings.sections.smartRoute.network.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
