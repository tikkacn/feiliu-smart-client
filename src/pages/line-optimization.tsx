/* eslint-disable @eslint-react/set-state-in-effect */
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import {
  Alert,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateRuleProvider } from 'tauri-plugin-mihomo-api'

import { BasePage } from '@/components/base'
import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'

const BUILTIN_PROVIDER_PREFIX = 'Feiliu-BM-'

const LineOptimizationPage = () => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const { ruleProviders } = useRulesData()
  const { refreshRules, refreshRuleProviders } = useAppRefreshers()
  const [useBuiltinRules, setUseBuiltinRules] = useState(true)
  const [updating, setUpdating] = useState(false)

  const builtinProviderNames = useMemo(
    () =>
      Object.keys(ruleProviders ?? {}).filter((name) =>
        name.startsWith(BUILTIN_PROVIDER_PREFIX),
      ),
    [ruleProviders],
  )

  useEffect(() => {
    setUseBuiltinRules(verge?.smart_route?.useBuiltinRules ?? true)
  }, [verge?.smart_route?.useBuiltinRules])

  const onToggleBuiltinRules = useLockFn(async (enabled: boolean) => {
    const previous = useBuiltinRules
    setUseBuiltinRules(enabled)

    try {
      await patchVerge({
        smart_route: {
          ...(verge?.smart_route ?? {}),
          useBuiltinRules: enabled,
        },
      })
      showNotice.success('settings.sections.smartRoute.messages.updated')
    } catch (error) {
      setUseBuiltinRules(previous)
      showNotice.error(error)
    }
  })

  const onUpdateBuiltinRules = useLockFn(async () => {
    if (builtinProviderNames.length === 0) {
      showNotice.info('rules.feedback.notifications.provider.none')
      return
    }

    setUpdating(true)
    let failed = 0

    try {
      for (const name of builtinProviderNames) {
        try {
          await updateRuleProvider(name)
        } catch (error) {
          failed += 1
          console.error(`[smart-route] failed to update ${name}`, error)
        }
      }

      await refreshRules()
      await refreshRuleProviders()

      if (failed === 0) {
        showNotice.success('rules.feedback.notifications.provider.allUpdated')
      } else {
        showNotice.error('rules.feedback.notifications.provider.genericError', {
          message: `${failed}/${builtinProviderNames.length}`,
        })
      }
    } catch (error) {
      showNotice.error(error)
    } finally {
      setUpdating(false)
    }
  })

  return (
    <BasePage title={t('settings.sections.smartRoute.title')}>
      <Stack spacing={1.5}>
        <Alert severity="info">
          {t('settings.sections.smartRoute.description')}
        </Alert>

        <Paper sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: 'space-between',
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={useBuiltinRules}
                    onChange={(event) =>
                      onToggleBuiltinRules(event.target.checked)
                    }
                  />
                }
                label={t('settings.sections.smartRoute.rules.enableBuiltin')}
              />
              <Button
                variant="outlined"
                startIcon={<RefreshRoundedIcon />}
                disabled={updating}
                onClick={onUpdateBuiltinRules}
              >
                {t('settings.sections.smartRoute.rules.updateNow')}
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {t('settings.sections.smartRoute.rules.builtinHint')}
            </Typography>
          </Stack>
        </Paper>
      </Stack>
    </BasePage>
  )
}

export default LineOptimizationPage
