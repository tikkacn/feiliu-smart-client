import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { useState } from 'react'

import { BasePage } from '@/components/base'
import { useFlystreamPolicy } from '@/hooks/use-flystream-policy'
import { clearFlystreamPolicy, setFlystreamPolicy } from '@/services/cmds'
import { getFlystreamApiBaseUrl } from '@/services/flystream-api'

const FlystreamPage = () => {
  const {
    configured,
    manifest,
    policy,
    network,
    error,
    loading,
    refreshing,
    refresh,
  } = useFlystreamPolicy()
  const [operation, setOperation] = useState<'apply' | 'clear' | null>(null)
  const [runtimeError, setRuntimeError] = useState(false)

  const applyPolicy = async () => {
    if (!policy) return
    setOperation('apply')
    setRuntimeError(false)
    try {
      const result = await setFlystreamPolicy(policy)
      if (result.status !== 'valid') setRuntimeError(true)
    } catch {
      setRuntimeError(true)
    } finally {
      setOperation(null)
    }
  }

  const clearPolicy = async () => {
    setOperation('clear')
    setRuntimeError(false)
    try {
      const result = await clearFlystreamPolicy()
      if (result.status !== 'valid') setRuntimeError(true)
    } catch {
      setRuntimeError(true)
    } finally {
      setOperation(null)
    }
  }

  return (
    <BasePage
      title="飞流智能优化"
      header={
        <Button
          size="small"
          startIcon={
            refreshing ? <CircularProgress size={14} /> : <RefreshRoundedIcon />
          }
          disabled={!configured || refreshing}
          onClick={() => void refresh()}
        >
          刷新策略
        </Button>
      }
    >
      <Stack spacing={2}>
        {!configured && (
          <Alert severity="info">
            尚未配置飞流控制面 API。配置 VITE_FEILIU_API_BASE_URL
            后，此页面会读取策略；不会影响原有代理功能。
          </Alert>
        )}
        {error && configured && (
          <Alert severity="warning">
            控制面暂时不可用，客户端将继续使用本地缓存或原有配置。
          </Alert>
        )}
        {runtimeError && (
          <Alert severity="error">
            运行时配置校验未通过，已保留之前的配置。
          </Alert>
        )}
        <Card sx={{ p: 2.5 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <AutoAwesomeOutlinedIcon color="primary" />
              <Typography variant="h6">策略状态</Typography>
              <Chip
                size="small"
                color={manifest ? 'success' : 'default'}
                label={manifest ? '已连接' : '未连接'}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              API：{getFlystreamApiBaseUrl() || '未配置'}
            </Typography>
            {loading && !manifest ? (
              <CircularProgress size={24} />
            ) : manifest ? (
              <Stack spacing={0.75}>
                <Typography variant="body2">
                  策略版本：{manifest.activePolicyVersion}
                </Typography>
                <Typography variant="body2">
                  规则版本：{manifest.latestRulesVersion}
                </Typography>
                {network && (
                  <Typography variant="body2">
                    当前运营商：{network.operator}（识别置信度{' '}
                    {Math.round(network.confidence * 100)}%）
                  </Typography>
                )}
                <Typography variant="body2">
                  有效期至：{new Date(manifest.expiresAt).toLocaleString()}
                </Typography>
              </Stack>
            ) : null}
          </Stack>
        </Card>
        {policy && (
          <Card sx={{ p: 2.5 }}>
            <Stack spacing={1.5}>
              <Typography variant="h6">节点与业务池</Typography>
              <Typography variant="body2" color="text.secondary">
                当前策略包含 {policy.nodes.length} 个节点、{policy.pools.length}{' '}
                个运营商/业务池。
              </Typography>
              <Divider />
              {policy.nodes.map((node) => (
                <Stack
                  key={node.id}
                  direction="row"
                  spacing={1}
                  sx={{ justifyContent: 'space-between' }}
                >
                  <Typography variant="body2">{node.displayName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {node.protocol} ·{' '}
                    {node.route.routeTypes.join(' / ') || '未标注'}
                  </Typography>
                </Stack>
              ))}
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={operation !== null}
                  onClick={() => void applyPolicy()}
                >
                  {operation === 'apply' ? '正在应用…' : '应用到运行时'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={operation !== null}
                  onClick={() => void clearPolicy()}
                >
                  {operation === 'clear' ? '正在恢复…' : '恢复原始配置'}
                </Button>
              </Stack>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  默认只读；点击应用后只修改当前运行时配置，不改写原始订阅文件。
                </Typography>
              </Box>
            </Stack>
          </Card>
        )}
      </Stack>
    </BasePage>
  )
}

export default FlystreamPage
