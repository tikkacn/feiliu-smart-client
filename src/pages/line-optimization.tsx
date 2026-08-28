/* eslint-disable @eslint-react/set-state-in-effect */
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { open } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BasePage } from '@/components/base'
import { useVerge } from '@/hooks/use-verge'
import { useProxiesData } from '@/providers/app-data-context'
import { importRuleFile, syncSmartClassifications } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  SMART_LINE_CATEGORIES,
  type SmartLineCategory,
} from '@/types/smart-route'

const CATEGORY_LABEL_KEYS: Record<SmartLineCategory, string> = {
  telecom: 'settings.sections.smartRoute.categories.telecom',
  unicom: 'settings.sections.smartRoute.categories.unicom',
  mobile: 'settings.sections.smartRoute.categories.mobile',
  'telecom-unicom': 'settings.sections.smartRoute.categories.telecomUnicom',
  'telecom-mobile': 'settings.sections.smartRoute.categories.telecomMobile',
  'unicom-mobile': 'settings.sections.smartRoute.categories.unicomMobile',
  'three-network': 'settings.sections.smartRoute.categories.threeNetwork',
}

const normalizeNodeName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

const RULE_TARGETS = [
  'auto',
  '电信优化',
  '联通优化',
  '移动优化',
  '全部节点',
  'DIRECT',
] as const

type RuleTarget = (typeof RULE_TARGETS)[number]

const RULE_TARGET_LABEL_KEYS: Record<RuleTarget, string> = {
  auto: 'settings.sections.smartRoute.rules.targets.auto',
  电信优化: 'settings.sections.smartRoute.rules.targets.telecom',
  联通优化: 'settings.sections.smartRoute.rules.targets.unicom',
  移动优化: 'settings.sections.smartRoute.rules.targets.mobile',
  全部节点: 'settings.sections.smartRoute.rules.targets.all',
  DIRECT: 'settings.sections.smartRoute.rules.targets.direct',
}

const RULE_BEHAVIORS = ['classical', 'domain', 'ipcidr'] as const

type RuleBehavior = (typeof RULE_BEHAVIORS)[number]

const RULE_BEHAVIOR_LABEL_KEYS: Record<RuleBehavior, string> = {
  classical: 'settings.sections.smartRoute.rules.behaviors.classical',
  domain: 'settings.sections.smartRoute.rules.behaviors.domain',
  ipcidr: 'settings.sections.smartRoute.rules.behaviors.ipcidr',
}

const RULE_FORMATS = ['yaml', 'text', 'mrs'] as const

type RuleFormat = (typeof RULE_FORMATS)[number]

const RULE_FORMAT_LABEL_KEYS: Record<RuleFormat, string> = {
  yaml: 'settings.sections.smartRoute.rules.formats.yaml',
  text: 'settings.sections.smartRoute.rules.formats.text',
  mrs: 'settings.sections.smartRoute.rules.formats.mrs',
}

const LineOptimizationPage = () => {
  const { t } = useTranslation()
  const { proxyView } = useProxiesData()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const [draft, setDraft] = useState<Record<string, SmartLineCategory>>({})
  const [remoteNodeCategories, setRemoteNodeCategories] = useState<
    Record<string, SmartLineCategory>
  >({})
  const [syncing, setSyncing] = useState(false)
  const [useBuiltinRules, setUseBuiltinRules] = useState(true)
  const [customRules, setCustomRules] = useState<CustomRuleSet[]>([])
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleUrl, setNewRuleUrl] = useState('')
  const [newRuleBehavior, setNewRuleBehavior] =
    useState<RuleBehavior>('classical')
  const [newRuleFormat, setNewRuleFormat] = useState<RuleFormat>('yaml')
  const [dirty, setDirty] = useState(false)

  const nodes = useMemo(
    () =>
      Object.values(proxyView?.records ?? {})
        .filter(
          (node) =>
            !['direct', 'reject'].includes(node.type.toLowerCase()) &&
            !['DIRECT', 'REJECT'].includes(node.name.toUpperCase()),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [proxyView?.records],
  )

  useEffect(() => {
    const smartRoute = verge?.smart_route
    const categories = smartRoute?.nodeCategories ?? {}
    setDraft({ ...categories })
    setRemoteNodeCategories({ ...(smartRoute?.remoteNodeCategories ?? {}) })
    setUseBuiltinRules(smartRoute?.useBuiltinRules ?? true)
    setCustomRules(
      (smartRoute?.customRules ?? []).map((rule) => ({
        ...rule,
        behavior: rule.behavior ?? 'classical',
        format: rule.format ?? 'yaml',
        enabled: rule.enabled ?? true,
      })),
    )
    setDirty(false)
  }, [verge?.smart_route])

  const remoteCategoryFor = useCallback(
    (name: string) =>
      remoteNodeCategories[name] ??
      remoteNodeCategories[normalizeNodeName(name)],
    [remoteNodeCategories],
  )

  const effectiveCategoryFor = useCallback(
    (name: string) => draft[name] ?? remoteCategoryFor(name),
    [draft, remoteCategoryFor],
  )

  const classifiedCount = useMemo(
    () => nodes.filter((node) => effectiveCategoryFor(node.name)).length,
    [effectiveCategoryFor, nodes],
  )

  const onSync = useLockFn(async () => {
    setSyncing(true)
    try {
      const result = await syncSmartClassifications()
      await mutateVerge()
      showNotice.success('settings.sections.smartRoute.messages.saved')
      console.debug('[smart-route] classification manifest synced', result)
    } catch (error) {
      showNotice.error(error)
    } finally {
      setSyncing(false)
    }
  })

  const onSave = useLockFn(async () => {
    const knownNodes = new Set(nodes.map((node) => node.name))
    const canPrune = proxyView?.providerState !== 'unavailable'
    const nodeCategories = Object.fromEntries(
      Object.entries(draft).filter(
        ([name, category]) =>
          SMART_LINE_CATEGORIES.includes(category) &&
          (!canPrune || knownNodes.has(name)),
      ),
    ) as Record<string, SmartLineCategory>

    try {
      await patchVerge({
        smart_route: {
          nodeCategories,
          remoteNodeCategories,
          remoteManifestVersion: verge?.smart_route?.remoteManifestVersion,
          remoteManifestUpdatedAt: verge?.smart_route?.remoteManifestUpdatedAt,
          useBuiltinRules,
          customRules,
        },
      })
      setDraft(nodeCategories)
      setDirty(false)
      showNotice.success('settings.sections.smartRoute.messages.saved')
    } catch (error) {
      showNotice.error(error)
    }
  })

  const addCustomRule = async (
    source: CustomRuleSource,
    nameOverride?: string,
  ) => {
    const name = (nameOverride ?? newRuleName).trim()
    if (!name) {
      showNotice.error('settings.sections.smartRoute.messages.ruleNameRequired')
      return
    }
    const id = nanoid()
    try {
      const persistedSource =
        source.kind === 'file'
          ? {
              kind: 'file' as const,
              path: await importRuleFile(source.path, id),
            }
          : source
      setCustomRules((current) => [
        ...current,
        {
          id,
          name,
          source: persistedSource,
          behavior: newRuleBehavior,
          format: newRuleFormat,
          enabled: true,
        },
      ])
      setNewRuleName('')
      setNewRuleUrl('')
      setNewRuleBehavior('classical')
      setNewRuleFormat('yaml')
      setDirty(true)
    } catch (error) {
      showNotice.error(error)
    }
  }

  const addUrlRule = async () => {
    const url = newRuleUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      showNotice.error('settings.sections.smartRoute.messages.invalidRuleUrl')
      return
    }
    await addCustomRule({ kind: 'url', url })
  }

  const addLocalRule = async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [
        { name: 'Clash rule files', extensions: ['yaml', 'yml', 'txt', 'mrs'] },
      ],
    })
    if (typeof selected !== 'string') return
    const fallbackName = selected.split(/[/\\]/).pop() ?? '本地规则'
    await addCustomRule(
      { kind: 'file', path: selected },
      newRuleName.trim() || fallbackName,
    )
  }

  return (
    <BasePage
      title={t('settings.sections.smartRoute.title')}
      header={
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshRoundedIcon />}
            disabled={syncing}
            onClick={onSync}
          >
            {t('settings.sections.smartRoute.actions.sync', {
              defaultValue: '同步网站分类',
            })}
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveRoundedIcon />}
            disabled={!dirty}
            onClick={onSave}
          >
            {t('settings.sections.smartRoute.actions.save')}
          </Button>
        </Stack>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Alert severity="info">
          {t('settings.sections.smartRoute.description')}
        </Alert>

        <Paper sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <FormControlLabel
              control={
                <Switch
                  checked={useBuiltinRules}
                  onChange={(event) => {
                    setUseBuiltinRules(event.target.checked)
                    setDirty(true)
                  }}
                />
              }
              label={t('settings.sections.smartRoute.rules.enableBuiltin')}
            />
            <Typography variant="body2" color="text.secondary">
              {t('settings.sections.smartRoute.rules.builtinHint')}
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                size="small"
                label={t('settings.sections.smartRoute.rules.name')}
                value={newRuleName}
                onChange={(event) => setNewRuleName(event.target.value)}
                sx={{ minWidth: 180 }}
              />
              <TextField
                size="small"
                label={t('settings.sections.smartRoute.rules.url')}
                value={newRuleUrl}
                onChange={(event) => setNewRuleUrl(event.target.value)}
                sx={{ flex: 1, minWidth: 260 }}
              />
              <Select
                size="small"
                value={newRuleBehavior}
                onChange={(event) =>
                  setNewRuleBehavior(event.target.value as RuleBehavior)
                }
                sx={{ minWidth: 150 }}
              >
                {RULE_BEHAVIORS.map((value) => (
                  <MenuItem key={value} value={value}>
                    {t(RULE_BEHAVIOR_LABEL_KEYS[value])}
                  </MenuItem>
                ))}
              </Select>
              <Select
                size="small"
                value={newRuleFormat}
                onChange={(event) =>
                  setNewRuleFormat(event.target.value as RuleFormat)
                }
                sx={{ minWidth: 110 }}
              >
                {RULE_FORMATS.map((value) => (
                  <MenuItem key={value} value={value}>
                    {t(RULE_FORMAT_LABEL_KEYS[value])}
                  </MenuItem>
                ))}
              </Select>
              <Button
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                onClick={addUrlRule}
              >
                {t('settings.sections.smartRoute.rules.addUrl')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<FolderOpenRoundedIcon />}
                onClick={addLocalRule}
              >
                {t('settings.sections.smartRoute.rules.addFile')}
              </Button>
            </Stack>
            {customRules.length > 0 && (
              <Stack spacing={1}>
                {customRules.map((rule) => {
                  const target = (rule.target ?? 'auto') as RuleTarget
                  const sourceLabel =
                    rule.source.kind === 'url'
                      ? rule.source.url
                      : rule.source.path
                  return (
                    <Stack
                      key={rule.id}
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1}
                      sx={{ alignItems: { xs: 'stretch', md: 'center' } }}
                    >
                      <Switch
                        size="small"
                        checked={rule.enabled !== false}
                        onChange={(event) => {
                          setCustomRules((current) =>
                            current.map((item) =>
                              item.id === rule.id
                                ? { ...item, enabled: event.target.checked }
                                : item,
                            ),
                          )
                          setDirty(true)
                        }}
                      />
                      <Typography sx={{ minWidth: 140 }}>
                        {rule.name}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ flex: 1, overflowWrap: 'anywhere' }}
                      >
                        {sourceLabel}
                      </Typography>
                      <Select
                        size="small"
                        value={(rule.behavior ?? 'classical') as RuleBehavior}
                        onChange={(event) => {
                          const value = event.target.value as RuleBehavior
                          setCustomRules((current) =>
                            current.map((item) =>
                              item.id === rule.id
                                ? { ...item, behavior: value }
                                : item,
                            ),
                          )
                          setDirty(true)
                        }}
                        sx={{ minWidth: 130 }}
                      >
                        {RULE_BEHAVIORS.map((value) => (
                          <MenuItem key={value} value={value}>
                            {t(RULE_BEHAVIOR_LABEL_KEYS[value])}
                          </MenuItem>
                        ))}
                      </Select>
                      <Select
                        size="small"
                        value={(rule.format ?? 'yaml') as RuleFormat}
                        onChange={(event) => {
                          const value = event.target.value as RuleFormat
                          setCustomRules((current) =>
                            current.map((item) =>
                              item.id === rule.id
                                ? { ...item, format: value }
                                : item,
                            ),
                          )
                          setDirty(true)
                        }}
                        sx={{ minWidth: 100 }}
                      >
                        {RULE_FORMATS.map((value) => (
                          <MenuItem key={value} value={value}>
                            {t(RULE_FORMAT_LABEL_KEYS[value])}
                          </MenuItem>
                        ))}
                      </Select>
                      <Select
                        size="small"
                        value={target}
                        onChange={(event) => {
                          const value = event.target.value as RuleTarget
                          setCustomRules((current) =>
                            current.map((item) =>
                              item.id === rule.id
                                ? {
                                    ...item,
                                    target:
                                      value === 'auto' ? undefined : value,
                                  }
                                : item,
                            ),
                          )
                          setDirty(true)
                        }}
                        sx={{ minWidth: 170 }}
                      >
                        {RULE_TARGETS.map((value) => (
                          <MenuItem key={value} value={value}>
                            {t(RULE_TARGET_LABEL_KEYS[value])}
                          </MenuItem>
                        ))}
                      </Select>
                      <IconButton
                        aria-label={t(
                          'settings.sections.smartRoute.rules.remove',
                        )}
                        onClick={() => {
                          setCustomRules((current) =>
                            current.filter((item) => item.id !== rule.id),
                          )
                          setDirty(true)
                        }}
                      >
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    </Stack>
                  )
                })}
              </Stack>
            )}
          </Stack>
        </Paper>

        {nodes.length === 0 ? (
          <Paper sx={{ p: 3 }}>
            <Typography color="text.secondary">
              {t('settings.sections.smartRoute.messages.noNodes')}
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1.5,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {t('settings.sections.smartRoute.summary', {
                  total: nodes.length,
                  classified: classifiedCount,
                })}
              </Typography>
              <Chip
                size="small"
                color={classifiedCount === nodes.length ? 'success' : 'default'}
                label={
                  classifiedCount === nodes.length
                    ? t('settings.sections.smartRoute.status.ready')
                    : t('settings.sections.smartRoute.status.pending')
                }
              />
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {t('settings.sections.smartRoute.fields.node')}
                  </TableCell>
                  <TableCell>
                    {t('settings.sections.smartRoute.fields.source')}
                  </TableCell>
                  <TableCell align="right">
                    {t('settings.sections.smartRoute.fields.category')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {nodes.map((node) => {
                  const category = effectiveCategoryFor(node.name) ?? ''
                  const isManual = Boolean(draft[node.name])
                  const hasRemote = Boolean(remoteCategoryFor(node.name))
                  return (
                    <TableRow key={`${node.source.kind}:${node.name}`} hover>
                      <TableCell sx={{ maxWidth: 360, wordBreak: 'break-all' }}>
                        {node.name}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>
                        {isManual
                          ? t('settings.sections.smartRoute.sources.manual', {
                              defaultValue: '手动覆盖',
                            })
                          : hasRemote
                            ? t(
                                'settings.sections.smartRoute.sources.website',
                                { defaultValue: '网站分类' },
                              )
                            : node.source.kind === 'provider'
                              ? `${t('settings.sections.smartRoute.sources.provider')} · ${node.source.providerName}`
                              : t(
                                  'settings.sections.smartRoute.sources.subscription',
                                )}
                      </TableCell>
                      <TableCell align="right">
                        <Select
                          size="small"
                          value={category}
                          displayEmpty
                          onChange={(event) => {
                            const value = event.target.value as
                              | SmartLineCategory
                              | ''
                            setDraft((current) => {
                              const next = { ...current }
                              const remoteCategory = remoteCategoryFor(
                                node.name,
                              )
                              if (value && value !== remoteCategory)
                                next[node.name] = value
                              else delete next[node.name]
                              return next
                            })
                            setDirty(true)
                          }}
                          sx={{ minWidth: 170, textAlign: 'left' }}
                        >
                          <MenuItem value="">
                            {t(
                              'settings.sections.smartRoute.categories.unclassified',
                            )}
                          </MenuItem>
                          {SMART_LINE_CATEGORIES.map((value) => (
                            <MenuItem key={value} value={value}>
                              {t(CATEGORY_LABEL_KEYS[value])}
                            </MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </BasePage>
  )
}

export default LineOptimizationPage
