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
  applySmartClassificationManifest,
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
import {
  classifySmartOperator,
  decideSmartOperatorPrompt,
  type SmartClassificationManifest,
  type SmartOperator,
} from '@/types/smart-route'
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
const SMART_CLASSIFICATION_MANIFEST_URL =
  'https://jiedian.328671.xyz/manifest.php'
const SMART_OPERATOR_REFRESH_INTERVAL = 2 * 60 * 1000
const SMART_OPERATOR_AUTO_SWITCH_SECONDS = 10

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

async function syncSmartClassificationsWithFallback() {
  // WebView2 uses the same native network path as the browser, which remains
  // available on Windows systems where the Rust TLS verifier or early TUN
  // routing blocks the backend transport. Rust still validates and persists
  // this payload before it can affect the runtime configuration. Prefer this
  // proven path so a known-slow backend verifier cannot delay group creation.
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  let webViewError: unknown
  try {
    const url = new URL(SMART_CLASSIFICATION_MANIFEST_URL)
    url.searchParams.set('_', String(Date.now()))
    const response = await window.fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`classification service returned HTTP ${response.status}`)
    }
    const manifest = (await response.json()) as SmartClassificationManifest
    return await applySmartClassificationManifest(manifest)
  } catch (error) {
    webViewError = error
  } finally {
    window.clearTimeout(timeout)
  }

  try {
    return await syncSmartClassifications()
  } catch (backendError) {
    throw new AggregateError(
      [backendError, webViewError],
      'unable to synchronize line classifications',
      { cause: backendError },
    )
  }
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
  const { verge, mutateVerge } = useVerge()
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
  const classificationSyncInFlightRef = useRef<
    ReturnType<typeof syncSmartClassificationsWithFallback> | undefined
  >(undefined)
  const hasVerge = Boolean(verge)
  const preferredOperator =
    verge?.smart_route?.preferredOperator ?? ('unknown' as const)
  const operatorConfirmed =
    verge?.smart_route?.operatorConfirmed ?? preferredOperator !== 'unknown'
  const savedSmartOperatorRef = useRef<SmartOperator>(preferredOperator)
  const operatorConfirmedRef = useRef(operatorConfirmed)
  const promptedDetectionRef = useRef<string | null>(null)
  const detectingSmartNetworkRef = useRef(false)
  const [smartNetworkPrompt, setSmartNetworkPrompt] =
    React.useState<SmartNetworkPrompt | null>(null)
  const [selectedSmartOperator, setSelectedSmartOperator] =
    React.useState<SmartOperator>('unknown')
  const [smartNetworkCountdown, setSmartNetworkCountdown] = React.useState<
    number | null
  >(null)
  const [applyingSmartNetwork, setApplyingSmartNetwork] = React.useState(false)

  useEffect(() => {
    savedSmartOperatorRef.current = preferredOperator
    operatorConfirmedRef.current = operatorConfirmed
  }, [operatorConfirmed, preferredOperator])

  const synchronizeSmartClassifications = useStableFn(async () => {
    if (classificationSyncInFlightRef.current) {
      return classificationSyncInFlightRef.current
    }

    const pending = (async () => {
      const result = await syncSmartClassificationsWithFallback()
      // Runtime regeneration has completed when the command resolves. Refresh
      // the proxy query now instead of waiting for its 15-second poll.
      await _refetchProxyView()
      return result
    })()
    classificationSyncInFlightRef.current = pending
    try {
      return await pending
    } finally {
      if (classificationSyncInFlightRef.current === pending) {
        classificationSyncInFlightRef.current = undefined
      }
    }
  })

  useEffect(() => {
    if (!hasVerge || !proxyNodeSignature) {
      return
    }

    let disposed = false
    let retryTimer: number | null = null
    let retryDelay = 30_000
    const scheduleRetry = () => {
      if (disposed || retryTimer !== null) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void sync()
      }, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 5 * 60 * 1000)
    }
    const sync = async (force = false) => {
      if (
        disposed ||
        (!force && remoteSyncSignatureRef.current === proxyNodeSignature)
      ) {
        return
      }

      remoteSyncSignatureRef.current = proxyNodeSignature
      try {
        await synchronizeSmartClassifications()
        retryDelay = 30_000
      } catch (error) {
        remoteSyncSignatureRef.current = null
        // The last successful manifest remains in the local config. A later
        // retry, periodic refresh, or subscription change will sync again.
        console.debug('[smart-route] remote classification unavailable', error)
        scheduleRetry()
      }
    }

    void sync()
    const timer = window.setInterval(() => {
      void sync(true)
    }, SMART_CLASSIFICATION_REFRESH_INTERVAL)

    return () => {
      disposed = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.clearInterval(timer)
    }
  }, [hasVerge, proxyNodeSignature, synchronizeSmartClassifications])

  useEffect(() => {
    if (!hasVerge || !proxyNodeSignature) return
    let disposed = false

    const refreshSmartNetwork = async () => {
      if (detectingSmartNetworkRef.current) return
      detectingSmartNetworkRef.current = true
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
        const decision = decideSmartOperatorPrompt({
          countryCode: ipInfo.country_code,
          detectedOperator: network.operator,
          preferredOperator: savedSmartOperatorRef.current,
          operatorConfirmed: operatorConfirmedRef.current,
        })
        if (decision.kind === 'none') return

        const detectionFingerprint = `${isDomestic ? 'CN' : 'FOREIGN'}:${decision.detectedOperator}`
        if (promptedDetectionRef.current === detectionFingerprint) return
        promptedDetectionRef.current = detectionFingerprint
        setSelectedSmartOperator(decision.selectedOperator)
        setSmartNetworkCountdown(
          decision.kind === 'changed'
            ? SMART_OPERATOR_AUTO_SWITCH_SECONDS
            : null,
        )
        setSmartNetworkPrompt({
          detectedOperator: decision.detectedOperator,
          detectedConfidence: network.confidence,
          changed: decision.kind === 'changed',
        })
      } catch (error) {
        // The persisted operator remains authoritative when the optional
        // public-IP lookup is unavailable.
        console.debug('[smart-route] network classification unavailable', error)
      } finally {
        detectingSmartNetworkRef.current = false
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshSmartNetwork()
    }

    void refreshSmartNetwork()
    const timer = window.setInterval(
      refreshSmartNetwork,
      SMART_OPERATOR_REFRESH_INTERVAL,
    )
    window.addEventListener('online', refreshSmartNetwork)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('online', refreshSmartNetwork)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [hasVerge, proxyNodeSignature])

  const smartOperatorLabel = (operator: SmartOperator) =>
    t(SMART_OPERATOR_LABEL_KEYS[operator])

  const applySmartNetwork = useStableFn(
    async (operatorOverride?: SmartOperator) => {
      if (!smartNetworkPrompt) return
      const prompt = smartNetworkPrompt
      const operator = operatorOverride ?? selectedSmartOperator
      const previousOperator = savedSmartOperatorRef.current
      const previousConfirmed = operatorConfirmedRef.current
      // Operator persistence and runtime regeneration continue asynchronously,
      // but confirming the choice should dismiss the modal immediately. Remote
      // classification refresh is already managed independently by the sync
      // effect above and must never block this interaction.
      setSmartNetworkPrompt(null)
      setSmartNetworkCountdown(null)
      setApplyingSmartNetwork(true)
      savedSmartOperatorRef.current = operator
      operatorConfirmedRef.current = true
      mutateVerge((current) =>
        current
          ? {
              ...current,
              smart_route: {
                ...(current.smart_route ?? {}),
                preferredOperator: operator,
                operatorConfirmed: true,
              },
            }
          : current,
      )
      try {
        const confidence =
          operator === prompt.detectedOperator
            ? prompt.detectedConfidence
            : operator === 'unknown'
              ? 0.15
              : 1
        await setSmartNetwork(operator, confidence)
      } catch (error) {
        savedSmartOperatorRef.current = previousOperator
        operatorConfirmedRef.current = previousConfirmed
        promptedDetectionRef.current = null
        mutateVerge((current) =>
          current
            ? {
                ...current,
                smart_route: {
                  ...(current.smart_route ?? {}),
                  preferredOperator: previousOperator,
                  operatorConfirmed: previousConfirmed,
                },
              }
            : current,
        )
        showNotice.error(error)
      } finally {
        setApplyingSmartNetwork(false)
      }
    },
  )

  useEffect(() => {
    if (!smartNetworkPrompt?.changed) return
    const interval = window.setInterval(() => {
      setSmartNetworkCountdown((current) =>
        current === null ? null : Math.max(0, current - 1),
      )
    }, 1000)
    const timeout = window.setTimeout(() => {
      void applySmartNetwork(smartNetworkPrompt.detectedOperator)
    }, SMART_OPERATOR_AUTO_SWITCH_SECONDS * 1000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [applySmartNetwork, smartNetworkPrompt])

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

    const handleProfileUpdateCompleted = () => {
      // A manual subscription update can replace the complete node set. Apply
      // the website classifications immediately, without waiting for the
      // proxy query's periodic poll or requiring an application restart.
      remoteSyncSignatureRef.current = null
      void synchronizeSmartClassifications().catch((error) => {
        console.debug(
          '[smart-route] post-subscription classification unavailable',
          error,
        )
      })
    }

    return subscribeVergeEvents({
      'profile-changed': handleProfileChanged,
      'profile-update-completed': handleProfileUpdateCompleted,
      'verge://refresh-profiles': handleRefreshProfiles,
      'verge://refresh-proxy-config': handleRefreshProxy,
    })
  }, [refreshProxy, synchronizeSmartClassifications])

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
        onClose={() => {
          if (!smartNetworkPrompt?.changed) setSmartNetworkPrompt(null)
        }}
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
          {!smartNetworkPrompt?.changed && (
            <Button
              onClick={() => setSmartNetworkPrompt(null)}
              disabled={applyingSmartNetwork}
            >
              {t('settings.sections.smartRoute.network.later')}
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => void applySmartNetwork()}
            disabled={applyingSmartNetwork}
          >
            {t('settings.sections.smartRoute.network.confirm')}
            {smartNetworkPrompt?.changed && smartNetworkCountdown !== null
              ? ` (${smartNetworkCountdown}s)`
              : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
